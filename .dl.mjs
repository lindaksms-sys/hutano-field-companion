import { AutoModelForCausalLM, AutoTokenizer, env } from "@huggingface/transformers";
env.cacheDir="/tmp/ev/hf";
const id="onnx-community/Qwen3-0.6B-ONNX", revision="da1453100cf3ff33ef56d17983fc7a8648706db6";
const t=await AutoTokenizer.from_pretrained(id,{revision});
const m=await AutoModelForCausalLM.from_pretrained(id,{revision,dtype:"q8",device:"cpu"});
const i=t.apply_chat_template([{role:"user",content:"Say {}"}],{add_generation_prompt:true,return_dict:true,enable_thinking:false});
const t0=Date.now();const o=await m.generate({...i,max_new_tokens:8,do_sample:false});
console.log("OK",Date.now()-t0,t.batch_decode(o,{skip_special_tokens:true})[0].slice(-40));
