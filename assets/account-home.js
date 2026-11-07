(async function () {


const {createClient}=window.supabase;
const SUPABASE_URL='https://podzzorjsvhsdiqistpd.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_8_E2DXr76Qq-NaOrVwc7_w_vSFngK3E';

const status=document.getElementById('authStatus'),dialog=document.getElementById('homeAuth');
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
let signedIn=false,ready=false,recoveryActive=false,recoverySession=null,authMode='signin',pendingEmail='',authBusy=false,resendAt=0;
const cooldownKey='veydravo-auth-resend-at';
try{resendAt=Number(sessionStorage.getItem(cooldownKey))||0}catch{}
function remaining(){return Math.max(0,Math.ceil((resendAt-Date.now())/1000))}
function startCooldown(){resendAt=Date.now()+60000;try{sessionStorage.setItem(cooldownKey,String(resendAt))}catch{}refreshCooldown()}
function refreshCooldown(){const left=remaining(),b=document.getElementById('resendCode');b.disabled=authBusy||left>0;b.textContent=left?'Resend code in '+left+'s':'Resend code';document.querySelector('#authForm button').disabled=authBusy||(authMode==='signin'&&left>0);}
setInterval(refreshCooldown,1000);
function authError(error){const msg=error?.message||'Please try again.';if(error?.status===429||/rate.limit|too many|security purposes/i.test(msg))return 'Too many requests. Wait a minute before trying again. Check your inbox and spam for the newest email.';if(/smtp|sending.*email|unexpected_failure/i.test(msg))return 'We could not send the email. Please try again shortly, or use your password.';if(/expired|invalid.*token|otp_expired/i.test(msg))return 'That code is invalid or expired. Use the newest email, or request another code.';if(/invalid login credentials/i.test(msg))return 'Email and password were not accepted. Use an email code instead, or reset your password.';if(/email not confirmed/i.test(msg))return 'Please verify your email. Choose Back to sign in, then request an email code.';if(/fetch|network/i.test(msg))return 'Connection lost. Check your internet and try again.';return msg;}
const recoveryOrigin='https://veltrix-finance.onrender.com', recoveryReturn=recoveryOrigin+'/', recoveryQuery=new URLSearchParams(location.search);
let dashboardPrepared=false;
function prepareDashboard(){
 if(dashboardPrepared||navigator.connection?.saveData)return;
 dashboardPrepared=true;
 for(const [href,as] of [['finance/index.html','document'],['assets/account-finance.js','script']]){
  const link=document.createElement('link');link.rel='prefetch';link.href=new URL(href,location.href).href;link.as=as;link.dataset.dashboardPrefetch='true';document.head.appendChild(link);
 }
}
function renderAccount(session){
 signedIn=!!session?.user;
 if(signedIn)prepareDashboard();
 document.getElementById('homeSignIn').hidden=signedIn;
 document.getElementById('homeAccount').hidden=!signedIn;
 document.getElementById('homeWorkspace').hidden=!signedIn;
 document.querySelectorAll('.home-dashboard').forEach(el=>el.hidden=!signedIn);
 if(signedIn&&dialog.open&&!recoveryActive)window.VeydravoCompat.closeDialog(dialog);
}
function accountMode(mode){
 authMode=mode;recoveryActive=mode==='request'||mode==='update'||mode==='reset-code';
 const login=mode==='signin'||mode==='password';
 document.getElementById('authForm').hidden=!login;
 document.getElementById('passwordLabel').hidden=mode!=='password';
 document.getElementById('password').required=mode==='password';
 document.querySelector('#authForm button').textContent=mode==='password'?'Sign in':'Email me a code';
 document.getElementById('codeForm').hidden=mode!=='code'&&mode!=='reset-code';
 document.getElementById('resendCode').hidden=mode!=='code'&&mode!=='reset-code';
 if(mode==='code'||mode==='reset-code')document.getElementById('codeEmail').value=pendingEmail;
 document.getElementById('enterResetCode').hidden=mode!=='request';
 document.getElementById('passwordMode').hidden=mode!=='signin';
 document.getElementById('enterCodeBtn').hidden=mode!=='signin';
 document.getElementById('registerBtn').hidden=mode!=='signin';
 document.getElementById('resetBtn').hidden=mode!=='password';
 document.getElementById('recoveryRequestForm').hidden=mode!=='request';
 document.getElementById('newPasswordForm').hidden=mode!=='update';
 document.getElementById('backToSignIn').hidden=mode==='signin';
 document.getElementById('homeAuthTitle').textContent=mode==='request'?'Reset your password.':mode==='update'?'Choose a new password.':mode==='reset-code'?'Enter your reset code.':mode==='code'?'Enter your email code.':'Welcome to VEYDRAVO.';
 document.getElementById('homeAuthIntro').textContent=mode==='request'?'Request a reset code for your VEYDRAVO account. You will enter it here before choosing a new password.':mode==='update'?'Your reset code is verified. Set a new password for this account.':mode==='reset-code'?'Enter your email address and the code from your newest VEYDRAVO sign-in email to verify this password reset.':mode==='code'?'Enter the email address that received your code and the code from your newest VEYDRAVO email.':mode==='password'?'Sign in with your existing email and password.':'New here or returning? Enter your email to create an account or sign in with a one-time code. No password needed.';
 if(!dialog.open)window.VeydravoCompat.openDialog(dialog);refreshCooldown();
}
function showSignIn(){accountMode('signin');status.textContent=ready?'':'Connecting to your account…';}
function showRecovery(){accountMode('request');status.textContent='';}
function showPasswordUpdate(session){
 if(!session?.user){showRecovery();status.textContent='Request a fresh reset code and enter it here.';return;}
 recoverySession=session;accountMode('update');status.textContent='';
}
document.getElementById('backToSignIn').onclick=showSignIn;
async function loadUser(user){renderAccount({user});document.getElementById('homeAccount').open=false;document.getElementById('password').value='';document.getElementById('homeWorkspace').scrollIntoView({behavior:'smooth',block:'start'});}
document.getElementById('homeSignIn').onclick=showSignIn;
document.getElementById('closeHomeAuth').onclick=()=>window.VeydravoCompat.closeDialog(dialog);
document.addEventListener('click',event=>{const link=event.target.closest('a[href="finance/index.html"]');if(link&&!signedIn){event.preventDefault();showSignIn();}});
 const emailInput=document.getElementById('email');
 const passwordInput=document.getElementById('password');
 const form=document.getElementById('authForm');
 const signInButton=form.querySelector('button[type="submit"]');
 const registerButton=document.getElementById('registerBtn');
 const resetButton=document.getElementById('resetBtn');
 const validEmail=()=>emailInput.value.trim()&&emailInput.checkValidity();
 const validCredentials=()=>{
   if(!validEmail()){status.textContent='Enter a valid email address.';emailInput.focus();return false;}
   if(passwordInput.value.length<8){status.textContent='Password must be at least 8 characters.';passwordInput.focus();return false;}
   return true;
 };
 const setBusy=busy=>{authBusy=busy;dialog.querySelectorAll('button:not(.auth-close)').forEach(b=>b.disabled=busy);refreshCooldown();};
 async function sendCode(){
 if(authBusy)return;
 if(!validEmail()){status.textContent='Enter a valid email address.';emailInput.focus();return;}
 if(remaining()){status.textContent='Please wait '+remaining()+' seconds before requesting another code.';return;}
 setBusy(true);status.textContent='Sending your email code…';
 try{
 const email=emailInput.value.trim();
 const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:recoveryReturn}});
 if(error)throw error;
 pendingEmail=email;document.getElementById('emailCode').value='';startCooldown();accountMode('code');
 status.textContent='Code sent. Keep this page open and enter the code from your email.';document.getElementById('emailCode').focus();
 }catch(error){status.textContent=authError(error);}finally{setBusy(false);}
 }
 form.onsubmit=async e=>{
 e.preventDefault();if(authMode!=='password'){await sendCode();return;}
 if(authBusy||!validCredentials())return;
 setBusy(true);status.textContent='Signing in…';
 try{const {data,error}=await supabase.auth.signInWithPassword({email:emailInput.value.trim(),password:passwordInput.value});if(error)throw error;if(data.user)await loadUser(data.user);}
 catch(error){status.textContent=authError(error);}finally{setBusy(false);}
 };
 registerButton.onclick=sendCode;
 document.getElementById('enterCodeBtn').onclick=()=>{
 pendingEmail=emailInput.value.trim();document.getElementById('emailCode').value='';accountMode('code');status.textContent='Enter the code from your newest VEYDRAVO email.';document.getElementById('emailCode').focus();
 };
 document.getElementById('passwordMode').onclick=()=>{accountMode('password');status.textContent='';};
 document.getElementById('resendCode').onclick=()=>{const email=document.getElementById('codeEmail').value.trim();if(authMode==='reset-code'){document.getElementById('recoveryEmail').value=email;sendResetCode();}else{emailInput.value=email;sendCode();}};
 document.getElementById('codeForm').onsubmit=async event=>{
 event.preventDefault();if(authBusy)return;
 const codeEmail=document.getElementById('codeEmail');
 if(!codeEmail.value.trim()||!codeEmail.checkValidity()){status.textContent='Enter the email address that received your code.';codeEmail.focus();return;}
 pendingEmail=codeEmail.value.trim();
 const resetting=authMode==='reset-code';
 const token=document.getElementById('emailCode').value.replace(/\s/g,'');
 if(!/^\d{6,10}$/.test(token)){status.textContent='Enter the numeric code from your newest email.';return;}
 setBusy(true);status.textContent='Verifying your code…';
 try{const {data,error}=await supabase.auth.verifyOtp({email:pendingEmail,token,type:'email'});if(error)throw error;if(!data.session?.user)throw new Error('Verification did not complete. Please request a new code.');document.getElementById('emailCode').value='';if(resetting){showPasswordUpdate(data.session);}else{await loadUser(data.session.user);}}
 catch(error){status.textContent=authError(error);}finally{setBusy(false);}
 };
resetButton.onclick=()=>{
 if(location.origin!==recoveryOrigin){location.assign(recoveryReturn+'?recover=1');return;}
 document.getElementById('recoveryEmail').value=emailInput.value.trim();showRecovery();
};
async function sendResetCode(){
 if(authBusy)return;
 const input=document.getElementById('recoveryEmail');
 if(!input.value.trim()||!input.checkValidity()){status.textContent='Enter a valid email address.';input.focus();return;}
 if(remaining()){status.textContent='Please wait '+remaining()+' seconds before requesting another email.';return;}
 setBusy(true);status.textContent='Sending reset code…';
 try{const {error}=await supabase.auth.signInWithOtp({email:input.value.trim(),options:{shouldCreateUser:false,emailRedirectTo:recoveryReturn}});if(error)throw error;
 pendingEmail=input.value.trim();document.getElementById('emailCode').value='';startCooldown();accountMode('reset-code');
 status.textContent='Check your inbox and spam for the newest VEYDRAVO sign-in code. Enter it here to verify this password reset.';
 }catch(error){status.textContent='Could not send the reset code: '+authError(error);}finally{setBusy(false);}
}
document.getElementById('recoveryRequestForm').onsubmit=async event=>{event.preventDefault();await sendResetCode();};
document.getElementById('enterResetCode').onclick=()=>{pendingEmail=document.getElementById('recoveryEmail').value.trim();document.getElementById('emailCode').value='';accountMode('reset-code');status.textContent='Use the code from your newest VEYDRAVO sign-in email to verify this password reset.';};
document.getElementById('newPasswordForm').onsubmit=async event=>{
 event.preventDefault();const password=document.getElementById('newPassword'),confirm=document.getElementById('confirmNewPassword'),button=event.target.querySelector('button');
 if(!password.reportValidity()||!confirm.reportValidity())return;
 if(password.value!==confirm.value){status.textContent='The two passwords do not match.';confirm.focus();return;}
 button.disabled=true;status.textContent='Saving your new password…';
 try{
 const {data:current,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;
 if(!recoverySession?.user||current.session?.user.id!==recoverySession.user.id)throw new Error('Your reset session expired. Request a new reset code.');
 const {error}=await supabase.auth.updateUser({password:password.value});if(error)throw error;
 emailInput.value=recoverySession.user.email||pendingEmail;passwordInput.value='';
 password.value='';confirm.value='';recoverySession=null;recoveryActive=false;
 const {error:signOutError}=await supabase.auth.signOut({scope:'local'});if(signOutError&&signOutError.name!=='AuthSessionMissingError')throw signOutError;
 renderAccount(null);accountMode('password');status.textContent='Password updated. Sign in with your new password.';passwordInput.focus();
 history.replaceState(null,'',location.pathname);
 }catch(error){status.textContent='Could not update your password: '+error.message;}finally{button.disabled=false;}
};
document.getElementById('homeSignOut').onclick=async()=>{
 const button=document.getElementById('homeSignOut');button.disabled=true;
 try{const {error}=await supabase.auth.signOut();if(error&&error.name!=='AuthSessionMissingError'&&error.message!=='Auth session missing!')throw error;renderAccount(null);document.getElementById('homeAccount').open=false;}
 catch(error){showSignIn();status.textContent='Could not sign out: '+error.message;}finally{button.disabled=false;}
};
supabase.auth.onAuthStateChange((event,session)=>{
 if(event==='PASSWORD_RECOVERY'){showPasswordUpdate(session);return;}
 renderAccount(session);
});
try{
 const {data,error}=await supabase.auth.getSession();if(error)throw error;
 renderAccount(data.session);ready=true;
 if(recoveryQuery.has('update-password'))showPasswordUpdate(data.session);
 else if(recoveryQuery.has('recover')&&!recoveryActive)showRecovery();
 else if((recoveryQuery.has('signin')||recoveryQuery.has('create'))&&!signedIn&&!recoveryActive)showSignIn();
 if(recoveryQuery.has('create')&&!signedIn)status.textContent='Enter your email, then choose Create account. We will email you a verification code.';
}catch(error){
 ready=true;showSignIn();status.textContent='Your previous session could not be restored. Request an email code to sign in again.';
}
const callbackError=new URLSearchParams(location.hash.slice(1)).has('error')||recoveryQuery.has('error');
if(callbackError){showSignIn();status.textContent='This email link could not be verified. Enter your email and request a code to continue.';history.replaceState(null,'',location.pathname);}

})().catch(function (error) {
 console.error("Account startup failed", error);
 window.VeydravoCompat.accountFailure();
});
