(() => {
"use strict";
const API_BASE_URL="https://central-extension-platform-api.onrender.com".replace(/\/+$/, "");
const EXTENSION_KEY="extension-01";
const STORAGE_KEY="cep_session_v1";
const read=async()=>(await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]||null;
const save=async(v)=>chrome.storage.local.set({[STORAGE_KEY]:v});
const clear=async()=>chrome.storage.local.remove(STORAGE_KEY);
async function api(path,method="GET",body=null,token=null){
 const cleanPath="/"+path.replace(/^\/+/, "");
 const response=await fetch(API_BASE_URL+cleanPath,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.detail||"Request failed");
 return data;
}
const app=document.createElement("div");
app.id="cep-original-extension-ui";
while(document.body.firstChild)app.appendChild(document.body.firstChild);
app.hidden=true;
document.body.appendChild(app);
const gate=document.createElement("div");
gate.id="cep-login-gate";
gate.style.cssText="font:14px Arial,sans-serif;padding:18px;min-width:300px;min-height:260px;background:#f7f8fc;color:#172033;box-sizing:border-box";
document.body.appendChild(gate);
function showLogin(message=""){
 app.hidden=true;
 gate.hidden=false;
 gate.innerHTML=`<section style="background:white;border:1px solid #e2e7f0;border-radius:14px;padding:20px;box-shadow:0 8px 28px #17233b0d"><small style="color:#68758a;font-weight:bold;letter-spacing:1px">CENTRAL EXTENSION PLATFORM</small><h2 style="font-size:19px;margin:10px 0 5px">Extension account login</h2><p style="font-size:12px;color:#68758a">Use the account assigned to this extension.</p><label>Username</label><input id="cep-user" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px;margin:5px 0 12px;border:1px solid #d5dce8;border-radius:7px"><label>Password</label><input id="cep-pass" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px;margin:5px 0;border:1px solid #d5dce8;border-radius:7px"><button id="cep-login" style="width:100%;padding:11px;margin-top:14px;background:#4058ca;color:white;border:0;border-radius:7px;font-weight:bold">Sign in</button><div id="cep-error" role="alert" style="font-size:12px;color:#b42318;margin-top:10px"></div></section>`;
 gate.querySelector("#cep-error").textContent=message;
 gate.querySelector("#cep-login").addEventListener("click",async()=>{
  const button=gate.querySelector("#cep-login"),username=gate.querySelector("#cep-user").value.trim(),password=gate.querySelector("#cep-pass").value;
  if(!username||!password){gate.querySelector("#cep-error").textContent="Enter username and password.";return;}
  button.disabled=true;gate.querySelector("#cep-error").textContent="Signing in…";
  try{
   const data=await api("/api/v1/auth/login","POST",{extension_id:EXTENSION_KEY,username,password});
   await save({extension_id:EXTENSION_KEY,access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+data.expires_in*1000});
   await startApp();
  }catch(error){gate.querySelector("#cep-error").textContent=error.message;button.disabled=false;}
 });
}
async function getValidSession(){
 let session=await read();
 if(!session||session.extension_id!==EXTENSION_KEY){await clear();return null;}
 try{
  if(Date.now()>=session.expires_at-30000){
   const data=await api("/api/v1/auth/refresh","POST",{refresh_token:session.refresh_token});
   session={...session,access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+data.expires_in*1000};
   await save(session);
  }
  await api("/api/v1/auth/me","GET",null,session.access_token);
  return session;
 }catch(error){await clear();return null;}
}
let appStarted=false;
async function startApp(){
 gate.hidden=true;app.hidden=false;
 if(appStarted)return;
 appStarted=true;
 const toolbar=document.createElement("div");
 toolbar.style.cssText="display:flex;justify-content:flex-end;padding:5px 8px;background:#f7f8fc";
 const logout=document.createElement("button");
 logout.textContent="Sign out";
 logout.style.cssText="font:11px Arial;padding:5px 9px;border:1px solid #d8deea;border-radius:6px;background:white;cursor:pointer";
 toolbar.appendChild(logout);app.prepend(toolbar);
 logout.addEventListener("click",async()=>{
  const session=await read();
  try{if(session)await api("/api/v1/auth/logout","POST",{},session.access_token);}catch(error){}
  await clear();
  location.reload();
 });
 const script=document.createElement("script");
 script.src="popup.js";
 script.onerror=()=>{toolbar.insertAdjacentText("beforeend"," Could not load original popup script.");};
 app.appendChild(script);
}
getValidSession().then(session=>session?startApp():showLogin()).catch(()=>showLogin("Unable to verify session. Check the backend URL."));
})();