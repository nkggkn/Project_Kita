// Apply explicit React translations; never mutate the DOM behind React.
import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const files=['app/room-library.tsx','app/project-pages.tsx','app/getting-started.tsx','app/guided-tour.tsx','app/removal-progress.tsx','app/checklist/removal-app.tsx'];
const displayNames=new Set(['title','label','body','tip','text','detail','c','t']);
const attributes=new Set(['placeholder','title','aria-label','alt']);
const brands=new Set(['Kaki Kita','AI','Kita Clear','BY PROJECT KITA','PROJECT KITA','A KAKI KITA AI COMPANION']);
const factory=ts.factory;
function call(expression){return factory.createCallExpression(factory.createIdentifier('translate'),undefined,[expression]);}
function render(expression){
 if(ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)){return expression.text.trim()&&!brands.has(expression.text.trim())?call(expression):expression;}
 if(ts.isTemplateExpression(expression))return call(expression);
 if(ts.isConditionalExpression(expression))return factory.updateConditionalExpression(expression,expression.condition,expression.questionToken,render(expression.whenTrue),expression.colonToken,render(expression.whenFalse));
 if(ts.isBinaryExpression(expression)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind))return factory.updateBinaryExpression(expression,expression.left,expression.operatorToken,render(expression.right));
 if(ts.isIdentifier(expression)&&displayNames.has(expression.text))return call(expression);
 if(ts.isPropertyAccessExpression(expression)&&displayNames.has(expression.name.text))return call(expression);
 if(ts.isCallExpression(expression)&&ts.isIdentifier(expression.expression)&&expression.expression.text==='String')return call(expression);
 return expression;
}
for(const file of files){
 const source=readFileSync(file,'utf8');
 mkdirSync('.sites-runtime/localize-backups',{recursive:true});
 writeFileSync('.sites-runtime/localize-backups/'+file.replaceAll('/','_'),source);
 if(source.includes('t: translate'))throw new Error('Already translated: '+file);
 const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const transformed=ts.transform(parsed,[context=>{
  function visit(node){
   if(ts.isFunctionDeclaration(node)&&node.name&&/^[A-Z]/.test(node.name.text)&&node.body){
    const body=ts.visitEachChild(node.body,visit,context);
    const hook=ts.createSourceFile('hook.ts','const {t: translate} = useLanguage();',ts.ScriptTarget.Latest,true).statements[0];
    return factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,factory.updateBlock(body,[hook,...body.statements]));
   }
   if(ts.isJsxAttribute(node)){
    if(!attributes.has(node.name.getText(parsed)))return node;
    if(node.initializer&&ts.isStringLiteral(node.initializer))return factory.updateJsxAttribute(node,node.name,factory.createJsxExpression(undefined,call(factory.createStringLiteral(node.initializer.text))));
    if(node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression)return factory.updateJsxAttribute(node,node.name,factory.updateJsxExpression(node.initializer,render(node.initializer.expression)));
    return node;
   }
   if(ts.isJsxText(node)&&node.text.trim()){
    const text=node.text.includes('\n')?node.text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join(' '):node.text;
    if(brands.has(text.trim()))return node;
    return factory.createJsxExpression(undefined,call(factory.createStringLiteral(text)));
   }
   if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(parsed)==='option'&&!node.openingElement.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(parsed)==='value')){
    const child=node.children.find(value=>ts.isJsxExpression(value)&&value.expression || ts.isJsxText(value)&&value.text.trim());
    const value=child&&ts.isJsxExpression(child)?child.expression:child&&ts.isJsxText(child)?factory.createStringLiteral(child.text.trim()):null;
    if(value){
     const opening=factory.updateJsxOpeningElement(node.openingElement,node.openingElement.tagName,node.openingElement.typeArguments,factory.updateJsxAttributes(node.openingElement.attributes,[...node.openingElement.attributes.properties,factory.createJsxAttribute(factory.createIdentifier('value'),factory.createJsxExpression(undefined,value))]));
     return ts.visitEachChild(factory.updateJsxElement(node,opening,node.children,node.closingElement),visit,context);
    }
   }
   if(ts.isJsxExpression(node)&&node.expression){const expression=ts.visitEachChild(node.expression,visit,context);return factory.updateJsxExpression(node,render(expression));}
   return ts.visitEachChild(node,visit,context);
  }
  return root=>ts.visitNode(root,visit);
 }]);
 const path=file.includes('/checklist/')?'../language-provider':'./language-provider';
 const imported=factory.createImportDeclaration(undefined,factory.createImportClause(false,undefined,factory.createNamedImports([factory.createImportSpecifier(false,undefined,factory.createIdentifier('useLanguage'))])),factory.createStringLiteral(path));
 let result=transformed.transformed[0];
 result=factory.updateSourceFile(result,[result.statements[0],imported,...result.statements.slice(1)]);
 writeFileSync(file,ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(result));
 transformed.dispose();
 console.log('Translated',file);
}
