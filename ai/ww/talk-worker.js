// 狼人殺 AI 發言：在 Web Worker 裡用 WebGPU 跑小型語言模型（transformers.js，ONNX 4-bit）
// 訊息：{cmd:'load',url,dtype} → {type:'ready',ms} 或 {type:'error',msg}
//       {cmd:'gen',id,prompt}   → {type:'gen',id,text,ms,n}
// 模型檔要先由頁面下載進 Cache Storage「ww-talk-model」（以完整網址當鍵）；這裡只從快取讀，不會自己去網路抓大檔
const TJS='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';
let T=null,tok=null,model=null,eos=[];
async function load(url,dtype){
  T=await import(TJS);
  const e=T.env;e.useBrowserCache=true;e.cacheKey='ww-talk-model';e.allowLocalModels=true;e.allowRemoteModels=false;
  // 網址拆成「上層資料夾」＋「最後一層」：transformers.js 會讀 上層/最後一層/檔名
  const u=url.replace(/\/+$/,''),i=u.lastIndexOf('/');e.localModelPath=u.slice(0,i+1);const id=u.slice(i+1);
  const t0=performance.now();
  tok=await T.AutoTokenizer.from_pretrained(id);
  model=await T.AutoModelForCausalLM.from_pretrained(id,{dtype,device:'webgpu'});
  eos=[tok.convert_tokens_to_ids?tok.convert_tokens_to_ids('<|im_end|>'):tok.model.tokens_to_ids.get('<|im_end|>')].filter(x=>x!=null);
  // 暖機：先跑一次，讓 GPU 著色器編譯好
  await gen('狼人殺6人\n現在：第1天，輪到我發言。',4);
  return performance.now()-t0;}
async function gen(prompt,max){
  const x=tok('<|im_start|>user\n'+prompt+'<|im_end|>\n<|im_start|>assistant\n',{add_special_tokens:false});
  const n=x.input_ids.dims[1];
  const o=await model.generate({...x,max_new_tokens:max||110,do_sample:true,temperature:0.8,top_p:0.9,repetition_penalty:1.05,no_repeat_ngram_size:7,eos_token_id:eos.length?eos:undefined});
  const out=o.slice(null,[n,null]);return{text:tok.decode(out[0],{skip_special_tokens:true}),n:out.dims[1],pn:n};}
let busy=Promise.resolve();
self.onmessage=ev=>{const m=ev.data||{};
  if(m.cmd==='load'){load(m.url,m.dtype||'q4f16').then(ms=>postMessage({type:'ready',ms}),e=>postMessage({type:'error',msg:String(e&&e.message||e)}));return;}
  if(m.cmd==='gen'){busy=busy.then(async()=>{const t0=performance.now();
      try{const r=await gen(m.prompt);postMessage({type:'gen',id:m.id,text:r.text,n:r.n,pn:r.pn,ms:performance.now()-t0});}
      catch(e){postMessage({type:'gen',id:m.id,text:null,err:String(e&&e.message||e),ms:performance.now()-t0});}});}};
