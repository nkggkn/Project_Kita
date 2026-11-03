package com.kakikita.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class TapoConnectionTest {
    @Test public void cameraUsesOnlyPrivateIpv4(){
        for(String ip:new String[]{"192.168.1.20","10.0.0.8","172.16.0.20","172.31.1.4"})assertEquals(ip,TapoConnection.cameraHost(ip));
        for(String ip:new String[]{"127.0.0.1","0.0.0.0","8.8.8.8","172.32.1.2","192.168.1.999","192.168.01.2","camera.local","192.168.1.2:554","192.168.1.1/path"})
            assertThrows(IllegalArgumentException.class,()->TapoConnection.cameraHost(ip));
    }
    @Test public void apiIsHttpsNgrokWithoutCredentialsOrPaths(){
        assertEquals("https://test.ngrok-free.dev",TapoConnection.apiBase(" https://test.ngrok-free.dev/ "));
        for(String url:new String[]{"http://test.ngrok-free.dev","https://test.ngrok-free.dev.evil.test","https://127.0.0.1","https://user:pass@test.ngrok-free.dev","https://test.ngrok-free.dev?token=secret","https://test.ngrok-free.dev/path","https://test.ngrok-free.dev:8080","https://test.ngrok-free.dev/#secret"})
            assertThrows(IllegalArgumentException.class,()->TapoConnection.apiBase(url));
    }
    @Test public void liveTokenCannotInjectHeaders(){
        String valid="abcdefghijklmnopqrstuvwxyz_1234567890-ABCD";
        assertEquals(valid,TapoConnection.token(valid));
        for(String value:new String[]{"short","Bearer "+valid,valid+"\r\nInjected: yes",valid+"?outside"})
            assertThrows(IllegalArgumentException.class,()->TapoConnection.token(value));
    }
}
