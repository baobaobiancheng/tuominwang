"""Byte-only, isolated LibreOffice UNO conversion. Never imports app storage/DB.
Official UNO: MacroExecMode.NEVER_EXECUTE=0; UpdateDocMode.NO_UPDATE=0.
https://api.libreoffice.org/docs/idl/ref/MacroExecMode_8idl.html
https://api.libreoffice.org/docs/idl/ref/UpdateDocMode_8idl.html
"""
import base64, hashlib, json, os, pathlib, signal, subprocess, tempfile, threading, time, uuid
MAX_BYTES=50*1024*1024  # existing upload/transport boundary, not aggregate ZIP
class ConversionFailure(Exception):
 def __init__(self,code):self.code=code;super().__init__(code)

def validate_input(data):
 if not isinstance(data,dict) or set(data)-{'jobId','mode','extension','bytesBase64','sha256','password'}:raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
 if data.get('mode')not in ('import','export')or data.get('extension')not in ('.doc','.wps'):raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
 try:
  job=data.get('jobId','')
  if not isinstance(job,str)or str(uuid.UUID(job))!=job:raise ValueError('invalid job')
 except (ValueError,TypeError,AttributeError):raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
 encoded=data.get('bytesBase64');expected=data.get('sha256')
 if not isinstance(encoded,str)or not isinstance(expected,str)or len(expected)!=64:raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
 try:source=base64.b64decode(encoded,validate=True)
 except (ValueError,TypeError):raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
 if not source or len(source)>MAX_BYTES or base64.b64encode(source).decode()!=encoded:raise ConversionFailure('FILE_SIZE_LIMIT')
 if hashlib.sha256(source).hexdigest()!=expected:raise ConversionFailure('SOURCE_MISMATCH')
 password=data.get('password')
 if password is not None:
  if not isinstance(password,str)or not password:raise ConversionFailure('DOCUMENT_PASSWORD_INVALID')
  try:size=len(password.encode('utf-16-le'))//2
  except UnicodeEncodeError:raise ConversionFailure('DOCUMENT_PASSWORD_INVALID')
  if size>4096:raise ConversionFailure('DOCUMENT_PASSWORD_INVALID')
 return source

def convert_bytes(data,cancel=None,store_password=None):
 source=validate_input(data);cancel=cancel or threading.Event()
 if cancel.is_set():raise ConversionFailure('PROCESSING_CANCELLED')
 import uno, unohelper
 from com.sun.star.task import XInteractionHandler
 from com.sun.star.beans import PropertyValue
 class AbortInteraction(unohelper.Base,XInteractionHandler):
  password_requested=False
  def handle(self,request):
   payload=request.getRequest()
   if 'Password'in str(type(payload))or'Password'in str(getattr(payload,'typeName','')):self.password_requested=True
   for continuation in request.getContinuations():
    try:abort=continuation.queryInterface(uno.getTypeByName('com.sun.star.task.XInteractionAbort'))
    except Exception:abort=None
    if abort is not None:abort.select();return
 def prop(name,value):
  p=PropertyValue();p.Name=name;p.Value=value;return p
 timeout=120 if data['mode']=='import' else 180;began=time.monotonic();timed_out=threading.Event();process=None;document=None
 with tempfile.TemporaryDirectory(prefix='tmw-legacy-')as temp:
  job=pathlib.Path(temp);profile=job/'profile';profile.mkdir(mode=0o700);input_path=job/('source'+(data['extension']if data['mode']=='import'else'.docx'));output=job/('converted.docx'if data['mode']=='import'else'converted.doc');input_path.write_bytes(source);pipe='tmw_'+uuid.uuid4().hex
  args=[os.environ.get('SOFFICE_PATH','/usr/bin/soffice'),'-env:UserInstallation='+profile.as_uri(),'--headless','--nologo','--nodefault','--nolockcheck','--norestore','--accept=pipe,name='+pipe+';urp;StarOffice.ServiceManager']
  environment={k:v for k,v in os.environ.items()if k in ('PATH','LANG','LC_ALL','LD_LIBRARY_PATH','PYTHONPATH')};environment.update(HOME=temp,TMPDIR=temp)
  try:process=subprocess.Popen(args,shell=False,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=environment,start_new_session=True)
  except OSError:raise ConversionFailure('LEGACY_OFFICE_CLIENT_MISSING')
  def stop():
   if process.poll()is None:
    try:os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:pass
  def watchdog():
   while process.poll()is None:
    if cancel.wait(.05):stop();return
    if time.monotonic()-began>timeout:timed_out.set();stop();return
  watcher=threading.Thread(target=watchdog,daemon=True);watcher.start()
  try:
   local=uno.getComponentContext();resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local);remote=None
   while remote is None:
    if cancel.is_set():raise ConversionFailure('PROCESSING_CANCELLED')
    if timed_out.is_set():raise ConversionFailure('LEGACY_OFFICE_TIMEOUT')
    if process.poll()is not None:raise ConversionFailure('LEGACY_OFFICE_BRIDGE_START_FAILED')
    try:remote=resolver.resolve('uno:pipe,name='+pipe+';urp;StarOffice.ComponentContext')
    except Exception:time.sleep(.05)
   manager=remote.ServiceManager;desktop=manager.createInstanceWithContext('com.sun.star.frame.Desktop',remote);interaction=AbortInteraction()
   properties=[prop('Hidden',True),prop('ReadOnly',True),prop('MacroExecutionMode',0),prop('UpdateDocMode',0),prop('PickListEntry',False),prop('InteractionHandler',interaction)]
   if data.get('password')is not None:properties.append(prop('Password',data['password']))
   try:document=desktop.loadComponentFromURL(uno.systemPathToFileUrl(str(input_path)),'_blank',0,tuple(properties))
   except Exception:
    if interaction.password_requested:raise ConversionFailure('DOCUMENT_PASSWORD_INVALID')
    raise ConversionFailure('LEGACY_OFFICE_CONVERSION_FAILED')
   if document is None:
    if interaction.password_requested:raise ConversionFailure('DOCUMENT_PASSWORD_INVALID')
    raise ConversionFailure('LEGACY_OFFICE_CONVERSION_FAILED')
   filters='Office Open XML Text'if data['mode']=='import'else'MS Word 97';store=[prop('FilterName',filters),prop('Overwrite',False)]
   if store_password is not None:store.append(prop('Password',store_password))
   document.storeToURL(uno.systemPathToFileUrl(str(output)),tuple(store));document.close(True);document=None
   result=output.read_bytes()
   if not result or len(result)>MAX_BYTES:raise ConversionFailure('LEGACY_OFFICE_OUTPUT_INVALID')
   try:provider=manager.createInstanceWithContext('com.sun.star.configuration.ConfigurationProvider',remote);access=provider.createInstanceWithArguments('com.sun.star.configuration.ConfigurationAccess',(prop('nodepath','/org.openoffice.Setup/Product'),));version=str(access.getPropertyValue('ooSetupVersionAboutBox'))
   except Exception:version='unknown'
   if cancel.is_set():raise ConversionFailure('PROCESSING_CANCELLED')
   return {'success':True,'jobId':data['jobId'],'bytesBase64':base64.b64encode(result).decode(),'sha256':hashlib.sha256(result).hexdigest(),'sourceSha256':data['sha256'],'engine':'libreoffice','engineVersion':version,'durationMs':round((time.monotonic()-began)*1000),'security':{'macroExecutionMode':0,'updateDocMode':0,'isolatedProfile':True,'serverPathsAccepted':False}}
  except ConversionFailure:raise
  except Exception:
   if cancel.is_set():raise ConversionFailure('PROCESSING_CANCELLED')
   if timed_out.is_set():raise ConversionFailure('LEGACY_OFFICE_TIMEOUT')
   raise ConversionFailure('LEGACY_OFFICE_CONVERSION_FAILED')
  finally:
   if document is not None:
    try:document.close(True)
    except Exception:pass
   stop()
   try:process.wait(timeout=3)
   except subprocess.TimeoutExpired:
    try:os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    process.wait(timeout=3)
   watcher.join(timeout=.1)

if __name__=='__main__':
 import sys
 os.umask(0o077)
 try:
  raw=sys.stdin.buffer.read(((MAX_BYTES+2)//3)*4+32769)
  if len(raw)>((MAX_BYTES+2)//3)*4+32768:raise ConversionFailure('FILE_SIZE_LIMIT')
  result=convert_bytes(json.loads(raw));sys.stdout.write(json.dumps(result,separators=(',',':')))
 except ConversionFailure as error:sys.stdout.write(json.dumps({'success':False,'error':error.code}));sys.exit(2)
 except Exception:sys.stdout.write(json.dumps({'success':False,'error':'LEGACY_OFFICE_CONVERSION_FAILED'}));sys.exit(2)
