import type {FastifyInstance} from 'fastify';
import {scoped,rows,sql} from '../../packages/adapters/db.ts';
import {releaseIdentity,updatePreferences} from '../../packages/core/release-state.ts';
/** Browser releases are deployed by the operator. Native installers are unavailable. */
export function registerReleaseStateRoutes(app:FastifyInstance){
 async function snapshot(db:any,ownerId:string){
  const [saved]=await rows(db,sql`SELECT preferences,introduced_release FROM release_preferences WHERE owner_id=${ownerId}`),release=releaseIdentity(),key=release.releaseId??release.version;
  return {supported:false,configured:false,currentVersion:release.version,releaseId:release.releaseId,phase:'unavailable',distribution:'web',
   capabilities:{checkDeployedRelease:true,nativeDownload:false,nativeInstall:false},preferences:updatePreferences(saved?.preferences),
   ...release.version!=='development'&&saved?.introduced_release!==key?{whatsNewRelease:{version:release.version,releaseId:release.releaseId}}:{}};
 }
 app.get('/api/software-update/state',async(req,reply)=>{reply.header('Cache-Control','no-store');return scoped(req.user.id,req.user.tenant_id,db=>snapshot(db,req.user.id));});
 app.put('/api/software-update/preferences',async req=>scoped(req.user.id,req.user.tenant_id,async db=>{
  const preferences=updatePreferences(req.body);
  await rows(db,sql`INSERT INTO release_preferences(tenant_id,owner_id,preferences) VALUES(${req.user.tenant_id},${req.user.id},${JSON.stringify(preferences)}::jsonb) ON CONFLICT(owner_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=now()`);
  return {success:true,state:await snapshot(db,req.user.id)};
 }));
 app.post('/api/software-update/acknowledge-whats-new',async req=>scoped(req.user.id,req.user.tenant_id,async db=>{
  const release=releaseIdentity(),key=release.releaseId??release.version;
  await rows(db,sql`INSERT INTO release_preferences(tenant_id,owner_id,introduced_release) VALUES(${req.user.tenant_id},${req.user.id},${key}) ON CONFLICT(owner_id) DO UPDATE SET introduced_release=EXCLUDED.introduced_release,updated_at=now()`);
  return {success:true,state:await snapshot(db,req.user.id)};
 }));
}
