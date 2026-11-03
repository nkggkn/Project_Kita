package com.kakikita.app;

import java.util.concurrent.CancellationException;
import java.util.function.Consumer;

/** Owns one foreground run, including a session returned after the user leaves. */
final class StreamLease {
    private final Consumer<String> stop;
    private boolean closed;
    private String session="";
    private Runnable cancelRequest;

    StreamLease(Consumer<String> stop){this.stop=stop;}
    synchronized boolean isClosed(){return closed;}

    synchronized void beginRequest(Runnable cancel,boolean startingSession){
        if(closed)throw new CancellationException();
        // Keep the start response readable so a late-created session can be stopped by ID.
        cancelRequest=startingSession?null:cancel;
    }
    synchronized void endRequest(Runnable cancel){if(cancelRequest==cancel)cancelRequest=null;}

    void attach(String id){
        boolean stopNow;
        synchronized(this){stopNow=closed;if(!closed)session=id;}
        if(stopNow)stop.accept(id);
    }
    void close(){
        String id;Runnable cancel;
        synchronized(this){
            if(closed)return;
            closed=true;id=session;session="";cancel=cancelRequest;cancelRequest=null;
        }
        if(!id.isEmpty())stop.accept(id);
        if(cancel!=null)cancel.run();
    }
}
