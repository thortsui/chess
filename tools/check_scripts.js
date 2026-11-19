// 檢查 index.html 裡每段非 text/plain 的 <script> 都能被解析（避免註解吃掉程式碼導致整頁失效）：node tools/check_scripts.js
const fs=require('fs');const s=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const re=/<script([^>]*)>([\s\S]*?)<\/script>/g;let m,n=0,bad=0;
while((m=re.exec(s))){const at=m[1];if(/src=|text\/plain|application\/json|importmap/.test(at))continue;n++;
  try{if(/type=["']?module/.test(at))new Function(m[2].replace(/^\s*import[^;]+;/gm,''));else new Function(m[2]);}catch(e){bad++;console.log('語法錯誤：第',s.slice(0,m.index).split('\n').length,'行的 <script>：',e.message);}}
console.log(`檢查 ${n} 段 <script>，${bad?bad+' 段有錯':'全部可以解析'}`);process.exit(bad?1:0);
