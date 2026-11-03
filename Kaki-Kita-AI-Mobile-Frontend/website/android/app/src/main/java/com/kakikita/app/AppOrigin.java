package com.kakikita.app;
import java.net.URI;

final class AppOrigin {
    static boolean isTrusted(String address,String origin){
        try{
            URI uri=new URI(address),app=new URI(origin);
            return "https".equalsIgnoreCase(uri.getScheme())&&app.getHost()!=null&&app.getHost().equalsIgnoreCase(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443)&&uri.getRawUserInfo()==null;
        }catch(Exception error){return false;}
    }
}
