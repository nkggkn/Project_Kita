package com.kakikita.app;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class StreamLeaseTest {
    @Test public void leavingStopsOnceAndCancelsUpload(){
        List<String> stopped=new ArrayList<>();AtomicInteger cancelled=new AtomicInteger();
        StreamLease run=new StreamLease(stopped::add);run.attach("one");
        run.beginRequest(cancelled::incrementAndGet,false);run.close();run.close();
        assertEquals(List.of("one"),stopped);assertEquals(1,cancelled.get());
        assertThrows(CancellationException.class,()->run.beginRequest(()->{},false));
    }
    @Test public void leavingDuringStartStopsTheLateSession()throws Exception{
        List<String> stopped=new ArrayList<>();AtomicInteger cancelled=new AtomicInteger();
        StreamLease run=new StreamLease(stopped::add);
        CountDownLatch started=new CountDownLatch(1),reply=new CountDownLatch(1);
        Thread serverReply=new Thread(()->{
            run.beginRequest(cancelled::incrementAndGet,true);started.countDown();
            try{if(!reply.await(2,TimeUnit.SECONDS))throw new AssertionError("No reply");}
            catch(InterruptedException error){throw new AssertionError(error);}
            run.attach("late");
        });
        serverReply.start();assertTrue(started.await(2,TimeUnit.SECONDS));run.close();
        reply.countDown();serverReply.join(2000);assertFalse(serverReply.isAlive());
        assertEquals(List.of("late"),stopped);assertEquals(0,cancelled.get());
    }
    @Test public void completedRequestIsNotCancelledAndNextRunIsIndependent(){
        List<String> stopped=new ArrayList<>();AtomicInteger cancelled=new AtomicInteger();
        StreamLease first=new StreamLease(stopped::add);Runnable cancel=cancelled::incrementAndGet;
        first.attach("old");first.beginRequest(cancel,false);first.endRequest(cancel);first.close();
        StreamLease second=new StreamLease(stopped::add);second.attach("new");first.close();
        assertFalse(second.isClosed());assertEquals(0,cancelled.get());assertEquals(List.of("old"),stopped);
        second.close();assertEquals(List.of("old","new"),stopped);
    }
}
