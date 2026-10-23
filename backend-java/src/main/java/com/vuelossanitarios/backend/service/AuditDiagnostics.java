package com.vuelossanitarios.backend.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;

/** Request-local, low-cardinality timings for read-only audit diagnostics. */
public final class AuditDiagnostics {
 private static final ThreadLocal<Context> CURRENT=new ThreadLocal<>();
 private AuditDiagnostics(){}
 public static Context begin(boolean enabled){Context c=new Context(enabled,UUID.randomUUID().toString());CURRENT.set(c);MDC.put("diagnosticId",c.id);return c;}
 public static Context current(){return CURRENT.get();}
 public static void clear(){CURRENT.remove();MDC.remove("diagnosticId");}
 public static void measure(String name,Runnable work){Context c=CURRENT.get();if(c==null||!c.enabled){work.run();return;}long start=System.nanoTime();try{work.run();}finally{c.add(name,System.nanoTime()-start);}}
 public static <T>T measure(String name,java.util.function.Supplier<T> work){Context c=CURRENT.get();if(c==null||!c.enabled)return work.get();long start=System.nanoTime();try{return work.get();}finally{c.add(name,System.nanoTime()-start);}}
 public static final class Context {
  private final boolean enabled; private final String id; private final Map<String,Long> nanos=new LinkedHashMap<>();
  private Context(boolean enabled,String id){this.enabled=enabled;this.id=id;}
  public String id(){return id;} public boolean enabled(){return enabled;}
  private synchronized void add(String key,long value){nanos.merge(key,value,Long::sum);}
  public synchronized String measurements(){StringBuilder b=new StringBuilder();nanos.forEach((k,v)->{if(!b.isEmpty())b.append(' ');b.append(k).append("_ms=").append(String.format(java.util.Locale.ROOT,"%.3f",v/1_000_000d));});return b.toString();}
 }
}
