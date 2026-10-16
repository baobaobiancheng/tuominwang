import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

test('migrated automatic snapshot shape rejects each missing required provenance field',async()=>{
  const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
  await db.connect();
  try{
    const result=await db.query(`SELECT pg_get_expr(c.conbin,c.conrelid) AS expression
      FROM pg_constraint c WHERE c.conname='review_snapshot_origin_shape'
        AND c.conrelid='review_snapshots'::regclass`);
    assert.equal(result.rowCount,1);
    const expression=result.rows[0].expression as string;
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE automatic_shape_probe(
      review_mode text NOT NULL, automatic_task_id uuid, automatic_actor_id uuid,
      automatic_source_revision integer, automatic_source_hash text,
      automatic_policy_version text, automatic_suppressed jsonb,
      revision integer NOT NULL, CHECK (${expression})) ON COMMIT DROP`);
    const fields=['review_mode','automatic_task_id','automatic_actor_id','automatic_source_revision',
      'automatic_source_hash','automatic_policy_version','automatic_suppressed','revision'];
    const valid=['automatic','11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',1,'a'.repeat(64),
      'automatic-source-decisions-1','[]',2];
    const insert=`INSERT INTO automatic_shape_probe(${fields.join(',')})
      VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')})`;
    await db.query(insert,valid);
    await db.query(insert,['legacy',null,null,null,null,null,null,1]);
    for(const field of fields.slice(3,7)){
      const values:(string|number|null)[]=[...valid];values[fields.indexOf(field)]=null;
      await db.query('SAVEPOINT missing_field');
      await assert.rejects(db.query(insert,values),(error:unknown)=>
        typeof error==='object'&&error!==null&&'code' in error&&error.code==='23514',field);
      await db.query('ROLLBACK TO SAVEPOINT missing_field');
    }
    await db.query('ROLLBACK');
  }finally{await db.end();}
});
