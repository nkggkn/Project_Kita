package com.kakikita.app;
public class AppOriginTest {
    public static void main(String[] args){
        String origin="https://kita-vision-room-library.subtleberet2.chatgpt.site";
        for(String path:new String[]{"/","/vision","/watch","/checklist?media=example"})if(!AppOrigin.isTrusted(origin+path,origin))throw new AssertionError(path);
        if(!AppOrigin.isTrusted(origin+":443/library",origin))throw new AssertionError("default TLS port");
        for(String bad:new String[]{origin+".evil.test/",origin.replace("https:","http:"),origin+":8443/","https://user@kita-vision-room-library.subtleberet2.chatgpt.site/","https://evil.test/","file:///data/private","javascript:alert(1)","content://private/file","https://[invalid"})if(AppOrigin.isTrusted(bad,origin))throw new AssertionError(bad);
        System.out.println("Passed: Android app origin, HTTPS, ports, phishing hosts, credentials and unsafe schemes.");
    }
}
