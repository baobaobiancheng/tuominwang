"""Private byte RPC. No database, app encryption keys or material mounts."""
import hmac,json,os,threading,time,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from convert import convert_bytes,validate_input,ConversionFailure,MAX_BYTES
TOKEN=os.environ.get('LEGACY_OFFICE_TOKEN','');JOBS={};CANCELLED={};LOCK=threading.Lock();SERIAL=threading.Lock();MAX_BODY=((MAX_BYTES+2)//3)*4+32768
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def response(self,status,value):
  raw=json.dumps(value,separators=(',',':')).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers()
  try:self.wfile.write(raw)
  except (BrokenPipeError,ConnectionResetError):pass
 def do_GET(self):
  if self.path!='/health':return self.response(404,{'error':'NOT_FOUND'})
  return self.response(200,{'service':'legacy-office','protocol':1,'dataKeyPresent':'DATA_KEY'in os.environ,'databasePresent':any('DATABASE'in k for k in os.environ),'macroExecutionMode':0,'updateDocMode':0})
 def do_POST(self):
  if len(TOKEN)<32 or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):return self.response(401,{'error':'UNAUTHORIZED'})
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<=0 or length>MAX_BODY:raise ConversionFailure('FILE_SIZE_LIMIT')
   body=self.rfile.read(length)
   if len(body)!=length:raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
   data=json.loads(body)
   if self.path=='/cancel':
    if not isinstance(data,dict)or set(data)!={'jobId'}:raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
    job=data['jobId']
    if not isinstance(job,str)or str(uuid.UUID(job))!=job:raise ConversionFailure('LEGACY_OFFICE_REQUEST_INVALID')
    with LOCK:
     now=time.monotonic()
     for stale in [key for key,expiry in CANCELLED.items()if expiry<=now]:CANCELLED.pop(stale,None)
     CANCELLED[job]=now+600;event=JOBS.get(job);event.set()if event else None
    return self.response(200,{'cancelled':event is not None,'recorded':True})
   if self.path!='/convert':return self.response(404,{'error':'NOT_FOUND'})
   validate_input(data);event=threading.Event()
   with LOCK:
    now=time.monotonic()
    for stale in [key for key,expiry in CANCELLED.items()if expiry<=now]:CANCELLED.pop(stale,None)
    if CANCELLED.get(data['jobId'],0)>now:raise ConversionFailure('PROCESSING_CANCELLED')
    if data['jobId']in JOBS:return self.response(409,{'error':'LEGACY_OFFICE_JOB_CONFLICT'})
    JOBS[data['jobId']]=event
   try:
    with SERIAL:
     with LOCK:
      if CANCELLED.get(data['jobId'],0)>time.monotonic():event.set()
     result=convert_bytes(data,event)
    return self.response(200,result)
   finally:
    with LOCK:JOBS.pop(data['jobId'],None)
  except ConversionFailure as error:return self.response(409,{'error':error.code})
  except (ValueError,TypeError,UnicodeError):return self.response(400,{'error':'LEGACY_OFFICE_REQUEST_INVALID'})
  except Exception:return self.response(500,{'error':'LEGACY_OFFICE_CONVERSION_FAILED'})
if __name__=='__main__':
 if len(TOKEN)<32:raise SystemExit('LEGACY_OFFICE_TOKEN_REQUIRED')
 os.umask(0o077);ThreadingHTTPServer(('0.0.0.0',4319),Handler).serve_forever()
