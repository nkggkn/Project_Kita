package com.kakikita.app;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.TextureView;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.rtsp.RtspMediaSource;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Foreground-only C200 relay. No RTSP credentials leave the phone. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public class TapoActivity extends Activity {
    private static final int BLUE=Color.rgb(36,83,155), RED=Color.rgb(175,59,74), INK=Color.rgb(30,52,80);
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private final ExecutorService cleanup=Executors.newCachedThreadPool();
    private volatile int generation=0;
    private int step=1;
    private long lastSequence=-1;
    private boolean cameraReady=false, running=false, sending=false, connecting=false;
    private ExoPlayer player;
    private TextureView video;
    private final LinearLayout[] panels=new LinearLayout[7];
    private ScrollView scroll;
    private TextView stepTitle;
    private ProgressBar progress;
    private TextView stepText,message,resultText;
    private EditText cameraIp,cameraUser,cameraPassword,apiUrl,apiToken;
    private Button cameraNext,cameraTest,start;
    private CheckBox useClaude;
    private ImageView annotated;
    private String apiBase="",liveToken="",session="";
    private StreamLease activeRun;
    private Player.Listener cameraListener;
    private String locale="en";
    private JSONObject translations=new JSONObject();

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        try(InputStream input=getAssets().open("translations.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)out.write(buffer,0,count);
            translations=new JSONObject(out.toString("UTF-8"));String chosen=getIntent().getStringExtra("locale");if(chosen!=null&&translations.has(chosen))locale=chosen;
        }catch(Exception ignored){/* English remains available without bundled translations. */}
        androidx.media3.common.util.Log.setLogLevel(androidx.media3.common.util.Log.LOG_LEVEL_OFF);
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(243,247,255));
        LinearLayout page=column();page.setPadding(dp(22),dp(18),dp(22),dp(30));scroll.addView(page);setContentView(scroll);
        ViewCompat.setOnApplyWindowInsetsListener(scroll,(view,insets)->{
            var bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return WindowInsetsCompat.CONSUMED;
        });
        page.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        LinearLayout navigation=new LinearLayout(this);
        Button back=button("Back",BLUE);back.setOnClickListener(v->goBack());navigation.addView(back,new LinearLayout.LayoutParams(0,-2,1));
        Button close=button("Close camera",RED);close.setOnClickListener(v->{disconnectAll();finish();});navigation.addView(close,new LinearLayout.LayoutParams(0,-2,1));page.addView(navigation);
        TextView title=text("Kita Watch · Tapo C200",26);title.setTypeface(null,Typeface.BOLD);page.addView(title);
        stepText=text("",18);page.addView(stepText);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(6);progress.setProgressTintList(ColorStateList.valueOf(BLUE));page.addView(progress,new LinearLayout.LayoutParams(-1,dp(8)));
        stepTitle=text("",27);stepTitle.setTypeface(null,Typeface.BOLD);ViewCompat.setAccessibilityHeading(stepTitle,true);page.addView(stepTitle);
        message=text("",20);message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);page.addView(message);
        video=new TextureView(this);page.addView(video,new LinearLayout.LayoutParams(-1,dp(210)));video.setVisibility(View.GONE);
        for(int i=1;i<=6;i++){
            panels[i]=column();panels[i].setPadding(dp(16),dp(8),dp(16),dp(16));
            GradientDrawable card=new GradientDrawable();card.setColor(Color.WHITE);card.setCornerRadius(dp(18));card.setStroke(dp(1),Color.rgb(216,226,243));panels[i].setBackground(card);page.addView(panels[i]);
        }
        panels[1].addView(text("1. Connect this phone to your camera Wi-Fi.\n\n2. Close live video in the Tapo app.\n\n3. Come back here.",20));
        next(panels[1],"Next",()->showStep(2));
        cameraIp=field(panels[2],"Camera IP","192.168.1.20",false);
        cameraIp.setInputType(InputType.TYPE_CLASS_PHONE);
        panels[2].addView(text("In Tapo: Device Settings → Device Info → IP Address.",18));
        next(panels[2],"Next",()->{try{TapoConnection.cameraHost(cameraIp.getText().toString());showStep(3);}catch(IllegalArgumentException error){say(error.getMessage());cameraIp.requestFocus();}});
        cameraUser=field(panels[3],"Camera username","From Tapo Camera Account",false);
        cameraPassword=field(panels[3],"Camera password","Camera password",true);
        panels[3].addView(text("In Tapo: Device Settings → Advanced Settings → Camera Account.\n\nUse this camera account, not your Tapo sign-in.",18));
        next(panels[3],"Next",()->{if(validCameraAccount())showStep(4);});
        cameraTest=button("Connect camera",BLUE);cameraTest.setOnClickListener(v->connectCamera());panels[4].addView(cameraTest);
        cameraNext=button("Next: connect AI",BLUE);cameraNext.setEnabled(false);cameraNext.setOnClickListener(v->showStep(5));panels[4].addView(cameraNext);
        apiUrl=field(panels[5],"Colab URL","https://your-tunnel.ngrok-free.dev",false);
        apiToken=field(panels[5],"Private live token","From the Tapo Colab notebook",true);
        panels[5].addView(text("In Colab: run the Tapo notebook. Copy its URL.\n\nLast cell: Private phone connection. Set SHOW_PHONE_TOKEN = True, then run that cell. Copy the token here.",18));
        useClaude=new CheckBox(this);useClaude.setText(t("Add scene notes (uses API credits)"));useClaude.setTextSize(18);useClaude.setMinHeight(dp(52));panels[5].addView(useClaude);
        start=button("Start live AI",BLUE);start.setOnClickListener(v->startLive());panels[5].addView(start);
        panels[6].addView(text("AI checks sampled frames. Keep this screen open.",18));
        annotated=new ImageView(this);annotated.setAdjustViewBounds(true);annotated.setContentDescription("Latest frame with detected object boxes");panels[6].addView(annotated,new LinearLayout.LayoutParams(-1,dp(220)));
        resultText=text("Waiting for the first result…",20);resultText.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);panels[6].addView(resultText);
        Button stop=button("Stop live view",RED);stop.setOnClickListener(v->{disconnectAll();showStep(4);say("Stopped. Tap Connect camera to start again.");});panels[6].addView(stop);
        panels[6].addView(text("AI can miss things. Check the room yourself. No audio is sent.",17));
        page.addView(text("Leaving this screen stops the camera and live AI.",17));
        showStep(1);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::goBack);
    }
    private LinearLayout column(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);return box;}
    private void next(LinearLayout panel,String label,Runnable action){Button next=button(label,BLUE);next.setOnClickListener(v->action.run());panel.addView(next);}
    private String t(String value){JSONObject words=translations.optJSONObject(locale);return words==null?value:words.optString(value,value);}
    private TextView text(String value,int size){TextView view=new TextView(this);view.setText(t(value));view.setTextSize(size);view.setTextColor(INK);view.setPadding(0,dp(10),0,dp(10));return view;}
    private Button button(String value,int color){Button view=new Button(this);view.setText(t(value));view.setTextSize(20);view.setAllCaps(false);view.setMinHeight(dp(58));view.setTextColor(Color.WHITE);view.setBackgroundTintList(new ColorStateList(new int[][]{new int[]{android.R.attr.state_enabled},new int[]{}},new int[]{color,Color.rgb(95,112,136)}));return view;}
    private EditText field(LinearLayout box,String label,String hint,boolean secret){
        TextView name=text(label,19);EditText field=new EditText(this);field.setId(View.generateViewId());name.setLabelFor(field.getId());box.addView(name);
        field.setTextSize(20);field.setTextColor(INK);field.setHint(t(hint));field.setSingleLine(true);field.setMinHeight(dp(54));field.setSaveEnabled(false);
        field.setInputType(InputType.TYPE_CLASS_TEXT|(secret?InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));box.addView(field);return field;
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void say(String value){message.setText(t(value));}
    private void showStep(int value){
        step=value;stepText.setText(value+" / 6");progress.setProgress(value);
        String[] titles={"","Use the same Wi-Fi","Find your camera IP","Camera account","Check your camera","Connect AI","See items live"};
        String[] prompts={"","Get your phone and camera ready.","Copy the IP address from Tapo.","Enter your camera username and password.","Tap Connect camera. Wait for the picture.","Paste the URL and private token from Colab.","Tap Stop when you finish."};
        stepTitle.setText(t(titles[value]));say(prompts[value]);
        for(int i=1;i<=6;i++)panels[i].setVisibility(i==value?View.VISIBLE:View.GONE);
        View focused=getCurrentFocus();if(focused!=null){((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(focused.getWindowToken(),0);focused.clearFocus();}
        scroll.smoothScrollTo(0,0);stepTitle.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED);
    }
    private boolean validCameraAccount(){
        String user=cameraUser.getText().toString(),password=cameraPassword.getText().toString();
        if(user.isEmpty()||user.length()>128||password.isEmpty()||password.length()>256){say("Enter your Tapo Camera Account username and password.");return false;}return true;
    }
    private void connectCamera(){
        try{
            String host=TapoConnection.cameraHost(cameraIp.getText().toString());
            String user=cameraUser.getText().toString(),password=cameraPassword.getText().toString();
            if(!validCameraAccount()){showStep(3);say("Enter your Tapo Camera Account username and password.");return;}
            releaseCamera();cameraTest.setEnabled(false);say("Connecting to your camera…");
            Uri uri=Uri.parse("rtsp://"+Uri.encode(user)+":"+Uri.encode(password)+"@"+host+":554/stream1");
            player=new ExoPlayer.Builder(this).build();player.setVideoTextureView(video);player.setVolume(0);video.setVisibility(View.VISIBLE);
            final ExoPlayer owner=player;
            cameraListener=new Player.Listener(){
                @Override public void onRenderedFirstFrame(){if(player!=owner)return;cameraReady=true;cameraTest.setEnabled(true);cameraNext.setEnabled(true);if(step==4)say("Camera connected. Tap Next.");}
                @Override public void onPlayerError(PlaybackException error){
                    if(player!=owner)return;disconnectAll();showStep(4);say("Cannot open the camera. Check Wi-Fi, IP, and Camera Account. Close extra viewers, then try again.");
                }
            };player.addListener(cameraListener);
            player.setMediaSource(new RtspMediaSource.Factory().setForceUseRtpTcp(true).setTimeoutMs(12000).createMediaSource(MediaItem.fromUri(uri)));
            player.prepare();player.play();
        }catch(IllegalArgumentException error){say(error.getMessage());cameraTest.setEnabled(true);}
        catch(Exception error){releaseCamera();say("Camera connection failed. Check the details and try again.");}
    }
    private void startLive(){
        if(connecting||running)return;
        if(!cameraReady){showStep(4);say("Connect your camera first.");return;}
        try{apiBase=TapoConnection.apiBase(apiUrl.getText().toString());liveToken=TapoConnection.token(apiToken.getText().toString());}
        catch(IllegalArgumentException error){say(error.getMessage());return;}
        final int current=++generation;final String base=apiBase,token=liveToken;final boolean notes=useClaude.isChecked();
        final StreamLease run=new StreamLease(id->cleanup.execute(()->stopRemote(base,token,id)));activeRun=run;
        connecting=true;start.setEnabled(false);say("Checking Colab…");
        network.execute(()->{
            try{
                JSONObject health=json(request(base,token,"/health","GET",null,null,run));
                if(!health.optBoolean("phone_relay_available"))throw new IllegalArgumentException("Run the new Tapo C200 Colab notebook, then copy its URL and token.");
                JSONObject payload=new JSONObject().put("use_claude",notes).put("interval",30).put("max_calls",5);
                JSONObject created=json(request(base,token,"/phone/start","POST",payload.toString().getBytes(StandardCharsets.UTF_8),"application/json",run));
                final String id=created.getString("session_id");if(!id.matches("[0-9a-f]{16}"))throw new IllegalArgumentException("Colab returned an invalid live session.");
                run.attach(id);if(run.isClosed())return;
                main.post(()->{
                    if(current!=generation||run.isClosed()){run.close();return;}
                    session=id;running=true;connecting=false;sending=false;lastSequence=-1;start.setEnabled(true);showStep(6);say("Live · AI is starting…");pump(current);
                });
            }catch(Exception error){run.close();if(current==generation)main.post(()->{if(current==generation){activeRun=null;connecting=false;start.setEnabled(true);say(error instanceof IllegalArgumentException?error.getMessage():"Cannot reach Colab. Check its URL and private token.");}});}
        });
    }
    private void pump(int current){
        if(!running||current!=generation||sending)return;
        if(!cameraReady||player==null||player.getPlaybackState()!=Player.STATE_READY||!video.isAvailable()){
            say("Camera paused. Waiting for video…");main.postDelayed(()->pump(current),1000);return;
        }
        Bitmap frame=video.getBitmap(960,540);
        if(frame==null){main.postDelayed(()->pump(current),1000);return;}
        sending=true;final String base=apiBase,token=liveToken,id=session;final StreamLease run=activeRun;
        network.execute(()->{
            try{
                if(run==null||run.isClosed())return;
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();frame.compress(Bitmap.CompressFormat.JPEG,75,bytes);
                request(base,token,"/phone/"+id+"/frame","POST",bytes.toByteArray(),"image/jpeg",run);
                JSONObject status=json(request(base,token,"/live/status","GET",null,null,run));
                if(!id.equals(status.optString("session_id")))throw new IllegalArgumentException("A different live session started. Connect again.");
                JSONObject latest=status.optJSONObject("latest");long seq=latest==null?-1:latest.optLong("seq",-1);
                Bitmap picture=null;
                if(seq>lastSequence){byte[] raw=request(base,token,"/live/frame.jpg","GET",null,null,run);picture=BitmapFactory.decodeByteArray(raw,0,raw.length);}
                final Bitmap result=picture;
                main.post(()->{
                    if(current!=generation){if(result!=null)result.recycle();return;}
                    sending=false;
                    if(result!=null){annotated.setImageBitmap(result);lastSequence=seq;}
                    if(latest!=null)resultText.setText(describe(status,latest));
                    if(!status.optBoolean("active")){disconnectAll();showStep(4);say("Live session ended. Tap Connect camera to start again.");return;}
                    say("Live · sampled camera frames");main.postDelayed(()->pump(current),1000);
                });
            }catch(Exception error){if(current==generation)main.post(()->{if(current==generation){disconnectAll();showStep(4);say(error instanceof IllegalArgumentException?error.getMessage():"AI connection stopped. Check Colab, then connect again.");}});}
            finally{frame.recycle();}
        });
    }
    private String describe(JSONObject status,JSONObject latest){
        StringBuilder text=new StringBuilder("AI frame ").append(latest.optLong("seq")).append("\n").append(latest.optString("captured_at")).append("\n\n");
        JSONArray items=latest.optJSONArray("detections");
        if(items==null||items.length()==0)text.append("No items found in this frame.\n");
        else for(int i=0;i<Math.min(15,items.length());i++){JSONObject item=items.optJSONObject(i);if(item!=null)text.append("• ").append(item.optString("label","Item")).append(" ").append(Math.round(item.optDouble("confidence")*100)).append("%\n");}
        JSONObject notes=status.optJSONObject("claude");
        if(notes!=null){JSONObject analysis=notes.optJSONObject("analysis");if(analysis!=null)text.append("\nScene note (frame ").append(notes.optLong("frame_seq")).append(")\n").append(analysis.optString("overall_summary"));}
        return text.toString();
    }
    private JSONObject json(byte[] raw)throws Exception{return new JSONObject(new String(raw,StandardCharsets.UTF_8));}
    private byte[] request(String base,String token,String path,String method,byte[] data,String contentType,StreamLease run)throws Exception{
        HttpsURLConnection connection=(HttpsURLConnection)new URL(base+path).openConnection();
        Runnable cancel=()->cleanup.execute(connection::disconnect);
        try{
            if(run!=null)run.beginRequest(cancel,path.equals("/phone/start"));
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(run==null?5000:12000);connection.setReadTimeout(run==null?5000:20000);connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("ngrok-skip-browser-warning","true");
            if(run!=null&&run.isClosed())throw new java.util.concurrent.CancellationException();
            if(data!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type",contentType);connection.setFixedLengthStreamingMode(data.length);try(var out=connection.getOutputStream()){out.write(data);}}
            int code=connection.getResponseCode();
            if(code==401)throw new IllegalArgumentException("Private token is not correct. Copy it from the running notebook.");
            if(code==409)throw new IllegalArgumentException(path.endsWith("/frame")?"Live session ended. Tap Back, then Start to continue.":"Stop the previous live session or wait 30 seconds, then start again.");
            if(code<200||code>=300)throw new IllegalArgumentException("Colab is not ready (HTTP "+code+"). Check the running Tapo notebook.");
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1){if(output.size()+count>3_000_000)throw new IllegalArgumentException("Colab returned too much data.");output.write(buffer,0,count);}return output.toByteArray();
            }
        }finally{if(run!=null)run.endRequest(cancel);connection.disconnect();}
    }
    private void stopRemote(String base,String token,String id){try{request(base,token,"/phone/"+id+"/stop","POST",new byte[0],"application/json",null);}catch(Exception ignored){/* Offline/force-kill fallback: Colab expires missing input after 30 seconds. */}}
    private void stopLive(){
        ++generation;running=false;connecting=false;sending=false;start.setEnabled(true);main.removeCallbacksAndMessages(null);
        StreamLease run=activeRun;activeRun=null;session="";if(run!=null)run.close();
        annotated.setImageDrawable(null);resultText.setText(t("Waiting for the first result…"));
    }
    private void releaseCamera(){
        cameraReady=false;cameraNext.setEnabled(false);cameraTest.setEnabled(true);
        ExoPlayer old=player;player=null;
        if(old!=null){if(cameraListener!=null)old.removeListener(cameraListener);old.clearVideoTextureView(video);old.release();}
        cameraListener=null;if(video!=null)video.setVisibility(View.GONE);
    }
    private void disconnectAll(){stopLive();releaseCamera();}
    private void goBack(){
        if(step>=4){disconnectAll();showStep(step==6?4:step-1);}
        else if(step>1)showStep(step-1);else{disconnectAll();finish();}
    }
    // Android 13+ uses the OnBackInvoked callback registered in onCreate; this covers older phones.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){goBack();}
    private void leaveScreen(){int resume=step>=4?4:step;disconnectAll();showStep(resume);say("Camera stopped. Connect again when ready.");}
    @Override protected void onPause(){leaveScreen();super.onPause();}
    @Override protected void onStop(){disconnectAll();super.onStop();}
    @Override protected void onDestroy(){
        disconnectAll();main.removeCallbacksAndMessages(null);
        // Let a pending start reply supply its ID before shutting down the stop executor.
        network.execute(()->cleanup.shutdown());network.shutdown();super.onDestroy();
    }
}
