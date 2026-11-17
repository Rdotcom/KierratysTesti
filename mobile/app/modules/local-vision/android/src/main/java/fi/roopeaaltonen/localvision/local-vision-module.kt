package fi.roopeaaltonen.localvision

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.UUID
import org.json.JSONObject

class LocalVisionModule: Module() {
  private var engine: AndroidVisionEngine? = null
  override fun definition() = ModuleDefinition {
    Name("KierratysLocalVision")
    OnCreate { engine=AndroidVisionEngine(appContext.reactContext?:throw IllegalStateException("context_unavailable")) }
    OnDestroy { engine?.close();engine=null }
    AsyncFunction("inspectReadiness") { promise:Promise -> dispatch(UUID.randomUUID().toString(),12000,promise,true){e,j->e.ready(j)} }
    AsyncFunction("recognizeObjectCandidates") { data:String,id:String,timeout:Int,promise:Promise -> dispatch(id,timeout,promise){e,j->e.objects(data,j)} }
    AsyncFunction("recognizeAndroidEvidence") { data:String,id:String,timeout:Int,promise:Promise -> dispatch(id,timeout,promise){e,j->e.evidence(data,j)} }
    Function("cancelObjectCandidates") { id:String -> engine?.cancel(id) }
    Function("cancelAndroidEvidence") { id:String -> engine?.cancel(id) }
  }
  private fun dispatch(id:String,timeout:Int,promise:Promise,readiness:Boolean=false,operation:(AndroidVisionEngine,VisionJob)->String){
    val current=engine
    if(current==null){promise.reject("ERR_LOCAL_VISION_UNAVAILABLE","unavailable",null);return}
    current.submit(id,timeout,{job->operation(current,job)}){value,error->
      if(error!=null)promise.reject("ERR_LOCAL_VISION_$error",error.lowercase(),null)
      else if(readiness){
        try{val parsed=JSONObject(value?:throw IllegalStateException());promise.resolve(mapOf("schemaVersion" to parsed.getString("schemaVersion"),"status" to parsed.getString("status"),"reason" to parsed.getString("reason"),"evidence" to parsed.getString("evidence")))}
        catch(_:Exception){promise.reject("ERR_LOCAL_VISION_FAILED","failed",null)}
      }else promise.resolve(value)
    }
  }
}
