package com.kakikita.app;

import java.net.URI;

/** Connection validation shared by the native screen and local JVM checks. */
public final class TapoConnection {
    private TapoConnection() {}
    public static String cameraHost(String value) {
        String host=value.trim();String[] parts=host.split("\\.",-1);
        if(parts.length!=4)throw new IllegalArgumentException("Enter the camera IP from Tapo Device Info, for example 192.168.1.20.");
        int[] numbers=new int[4];
        for(int i=0;i<4;i++){
            if(!parts[i].matches("0|[1-9][0-9]{0,2}"))throw new IllegalArgumentException("Enter a valid camera IP.");
            numbers[i]=Integer.parseInt(parts[i]);if(numbers[i]>255)throw new IllegalArgumentException("Enter a valid camera IP.");
        }
        if(!(numbers[0]==10||numbers[0]==192&&numbers[1]==168||numbers[0]==172&&numbers[1]>=16&&numbers[1]<=31))
            throw new IllegalArgumentException("Use your camera's private Wi-Fi IP address.");
        return host;
    }
    public static String apiBase(String value) {
        try {
            URI uri=new URI(value.trim());String host=uri.getHost();
            if(!"https".equals(uri.getScheme())||host==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||uri.getPort()!=-1&&uri.getPort()!=443)
                throw new IllegalArgumentException();
            if(!(host.endsWith(".ngrok-free.dev")||host.endsWith(".ngrok-free.app")||host.endsWith(".ngrok.app")))throw new IllegalArgumentException();
            if(uri.getPath()!=null&&!uri.getPath().isEmpty()&&!uri.getPath().equals("/"))throw new IllegalArgumentException();
            return "https://"+host;
        }catch(Exception error){throw new IllegalArgumentException("Paste only the HTTPS ngrok URL printed by Colab.");}
    }
    public static String token(String value) {
        String token=value.trim();
        if(!token.matches("[A-Za-z0-9_-]{32,256}"))throw new IllegalArgumentException("Copy the private live token from the Tapo Colab notebook.");
        return token;
    }
}
