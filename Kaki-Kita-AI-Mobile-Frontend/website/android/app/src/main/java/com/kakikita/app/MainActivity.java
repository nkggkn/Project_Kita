package com.kakikita.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 20, SAVE_REPORT = 21;
    private WebView web;
    private ProgressBar progress;
    private LinearLayout offline;
    private ValueCallback<Uri[]> upload;
    private Uri captureUri;
    private File captureFile;
    private String pendingReport;
    private String lastPage = BuildConfig.APP_ORIGIN + "/";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        File captureDirectory = new File(getCacheDir(),"captures");
        File[] oldCaptures = captureDirectory.listFiles();
        if(oldCaptures!=null)for(File file:oldCaptures)if(System.currentTimeMillis()-file.lastModified()>24*60*60*1000L)file.delete();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246,248,241));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view,insets) -> {
            var bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        web = new WebView(this);
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        progress = new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        root.addView(progress,new FrameLayout.LayoutParams(-1,dp(4),Gravity.TOP));
        offline = new LinearLayout(this);
        offline.setOrientation(LinearLayout.VERTICAL);offline.setGravity(Gravity.CENTER);
        offline.setPadding(dp(28),dp(28),dp(28),dp(28));offline.setBackgroundColor(Color.rgb(246,248,241));
        TextView message = new TextView(this);message.setText("Could not open Kaki Kita AI\n\nCheck your internet connection, then try again.");message.setTextSize(23);message.setGravity(Gravity.CENTER);message.setTextColor(Color.rgb(40,80,50));offline.addView(message);
        Button retry = new Button(this);retry.setText("Try again");retry.setTextSize(20);retry.setMinHeight(dp(56));retry.setOnClickListener(v -> web.loadUrl(lastPage));offline.addView(retry);
        offline.setVisibility(View.GONE);root.addView(offline,new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString()+" KakiKitaAndroid/1.1 KakiKitaTapo/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                if(trusted(request.getUrl()))return false;
                openExternal(request.getUrl());return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){
                if(trusted(Uri.parse(url))){lastPage=url;offline.setVisibility(View.GONE);}
            }
            @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())showOffline();}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=500)showOffline();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value==100?View.GONE:View.VISIBLE);}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                cancelUpload();
                if(!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl()))){callback.onReceiveValue(null);return true;}
                upload=callback;
                try {
                    if(params.isCaptureEnabled()){
                        boolean video=String.join(",",params.getAcceptTypes()).contains("video");
                        File directory = new File(getCacheDir(),"captures");
                        if(!directory.exists()&&!directory.mkdirs())throw new IllegalStateException();
                        captureFile=File.createTempFile("room-",video?".mp4":".jpg",directory);
                        captureUri=FileProvider.getUriForFile(MainActivity.this,BuildConfig.APPLICATION_ID+".files",captureFile);
                        Intent camera = new Intent(video?MediaStore.ACTION_VIDEO_CAPTURE:MediaStore.ACTION_IMAGE_CAPTURE);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT,captureUri);
                        camera.setClipData(ClipData.newRawUri("Room capture",captureUri));
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if(video)camera.putExtra(MediaStore.EXTRA_SIZE_LIMIT,25L*1024*1024);
                        startActivityForResult(camera,PICK_FILE);
                    }else startActivityForResult(params.createIntent(),PICK_FILE);
                }catch(Exception error){cancelUpload();Toast.makeText(MainActivity.this,"Cannot open camera or gallery. Try the other option.",Toast.LENGTH_LONG).show();}
                return true;
            }
        });
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            WebViewCompat.addWebMessageListener(web,"KakiKitaNative",Collections.singleton(BuildConfig.APP_ORIGIN),(view,webMessage,origin,mainFrame,reply)->{
                if(!mainFrame||!trusted(origin)||!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl())))return;
                try {
                    String text=webMessage.getData();if(text==null||text.length()>8*1024*1024)return;
                    JSONObject data=new JSONObject(text);
                    if("open_tapo".equals(data.optString("action"))){startActivity(new Intent(this,TapoActivity.class).putExtra("locale",data.optString("locale","en")));return;}
                    if("print".equals(data.optString("action"))){PrintManager printer=(PrintManager)getSystemService(PRINT_SERVICE);printer.print("Kaki Kita room review",web.createPrintDocumentAdapter("Kaki Kita room review"),new PrintAttributes.Builder().build());}
                    if("save_json".equals(data.optString("action"))&&pendingReport==null){
                        String report=data.getString("data");new JSONObject(report);
                        String name=data.optString("name","room-report.json").replaceAll("[^a-zA-Z0-9_.-]","-");
                        if(name.length()>120)name="room-report.json";
                        if(!name.endsWith(".json"))name+=".json";
                        pendingReport=report;
                        Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,name);
                        try{startActivityForResult(save,SAVE_REPORT);}catch(Exception error){pendingReport=null;throw error;}
                    }
                }catch(Exception error){Toast.makeText(this,"Could not save or print. Please try again.",Toast.LENGTH_LONG).show();}
            });
        }
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::goBack);
        if(state==null||web.restoreState(state)==null)web.loadUrl(lastPage);
    }
    private boolean trusted(Uri uri){return AppOrigin.isTrusted(uri.toString(),BuildConfig.APP_ORIGIN);}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void showOffline(){progress.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);}
    private void openExternal(Uri uri){String scheme=uri.getScheme();if(!"https".equals(scheme)&&!"tel".equals(scheme)&&!"mailto".equals(scheme))return;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){Toast.makeText(this,"Cannot open this link.",Toast.LENGTH_SHORT).show();}}
    private void cancelUpload(){if(upload!=null)upload.onReceiveValue(null);upload=null;if(captureFile!=null)captureFile.delete();captureFile=null;captureUri=null;}
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE){
            if(upload==null){cancelUpload();return;}
            ArrayList<Uri> selected=new ArrayList<>();
            if(result==RESULT_OK){
                if(captureUri!=null&&captureFile!=null&&captureFile.length()>0)selected.add(captureUri);
                else if(data!=null){if(data.getClipData()!=null){for(int i=0;i<Math.min(20,data.getClipData().getItemCount());i++){Uri uri=data.getClipData().getItemAt(i).getUri();if("content".equals(uri.getScheme())&&!(BuildConfig.APPLICATION_ID+".files").equals(uri.getAuthority()))selected.add(uri);}}else if(data.getData()!=null&&"content".equals(data.getData().getScheme())&&!(BuildConfig.APPLICATION_ID+".files").equals(data.getData().getAuthority()))selected.add(data.getData());}
            }
            upload.onReceiveValue(selected.isEmpty()?null:selected.toArray(new Uri[0]));upload=null;
            // Keep a successful capture until a later app launch so WebView can read it.
            if(selected.isEmpty()&&captureFile!=null)captureFile.delete();
            captureUri=null;captureFile=null;
        }
        if(request==SAVE_REPORT){String report=pendingReport;pendingReport=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&report!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IllegalStateException();out.write(report.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"Report saved",Toast.LENGTH_SHORT).show();}catch(Exception error){Toast.makeText(this,"Could not save the report.",Toast.LENGTH_LONG).show();}}}
    }
    private void goBack(){if(web.canGoBack())web.goBack();else new AlertDialog.Builder(this).setMessage("Close Kaki Kita AI?").setNegativeButton("Stay",null).setPositiveButton("Close",(dialog,which)->finish()).show();}
    // Android 13+ uses the OnBackInvoked callback registered in onCreate; this covers older phones.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){goBack();}
    @Override protected void onPause(){super.onPause();CookieManager.getInstance().flush();web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
    @Override protected void onDestroy(){cancelUpload();web.destroy();super.onDestroy();}
}
