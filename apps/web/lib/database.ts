import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { legendaryPool?: Pool };

function pool(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if(!globalForDb.legendaryPool){
    globalForDb.legendaryPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalForDb.legendaryPool;
}

const ident=(s:string)=>{
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error(`Invalid SQL identifier: ${s}`);
  return `"${s}"`;
};

type Filter={kind:'eq'|'is'|'gte'|'lte'|'in'; column:string; value:any};

type Result={data:any;error:any;count?:number|null};

class QueryBuilder implements PromiseLike<Result>{
  private action:'select'|'insert'|'update'|'upsert'='select';
  private values:any=null;
  private selected='*';
  private options:any={};
  private filters:Filter[]=[];
  private orders:{column:string;ascending:boolean}[]=[];
  private maxRows:number|undefined;
  private singleMode:'maybe'|'single'|null=null;
  private conflict='';
  private returning:string|null=null;

  constructor(private table:string){}

  select(columns='*',options:any={}){
    if(this.action==='insert'||this.action==='update'||this.action==='upsert') this.returning=columns;
    else { this.action='select'; this.selected=columns; this.options=options||{}; }
    return this;
  }
  insert(values:any){this.action='insert';this.values=values;return this;}
  update(values:any){this.action='update';this.values=values;return this;}
  upsert(values:any,options:any={}){this.action='upsert';this.values=values;this.conflict=options?.onConflict||'';return this;}
  eq(column:string,value:any){this.filters.push({kind:'eq',column,value});return this;}
  is(column:string,value:any){this.filters.push({kind:'is',column,value});return this;}
  gte(column:string,value:any){this.filters.push({kind:'gte',column,value});return this;}
  lte(column:string,value:any){this.filters.push({kind:'lte',column,value});return this;}
  in(column:string,value:any[]){this.filters.push({kind:'in',column,value});return this;}
  order(column:string,opts:any={}){this.orders.push({column,ascending:opts?.ascending!==false});return this;}
  limit(n:number){this.maxRows=n;return this;}
  maybeSingle(){this.singleMode='maybe';return this.execute();}
  single(){this.singleMode='single';return this.execute();}
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null){
    return this.execute().then(onfulfilled,onrejected);
  }

  private relationSelect(){
    const m=this.selected.match(/employees\(([^)]+)\)/);
    if(!m) return null;
    if(!['attendance','leave_requests','resignation_requests'].includes(this.table)) return null;
    const cols=m[1].split(',').map(x=>x.trim()).filter(Boolean);
    const base=this.selected.startsWith('*,')?'t.*':this.selected.split(',employees(')[0].split(',').map(x=>`t.${ident(x.trim())}`).join(', ');
    const pairs=cols.flatMap(c=>[`'${c}'`,`e.${ident(c)}`]).join(', ');
    return {select:`${base}, json_build_object(${pairs}) as employees`,join:` left join employees e on e.id=t.employee_id`};
  }

  private where(params:any[],prefix='t'){
    if(!this.filters.length) return '';
    const clauses=this.filters.map(f=>{
      const col=`${prefix}.${ident(f.column)}`;
      if(f.kind==='is'&&f.value===null) return `${col} is null`;
      if(f.kind==='is'&&f.value!==null){params.push(f.value);return `${col} is not distinct from $${params.length}`;}
      if(f.kind==='in'){
        if(!Array.isArray(f.value)||!f.value.length) return 'false';
        const placeholders=f.value.map((v:any)=>{params.push(v);return `$${params.length}`;});
        return `${col} in (${placeholders.join(',')})`;
      }
      params.push(f.value);
      const op=f.kind==='eq'?'=':f.kind==='gte'?'>=':'<=';
      return `${col} ${op} $${params.length}`;
    });
    return ` where ${clauses.join(' and ')}`;
  }

  private returningSql(){
    if(!this.returning) return '';
    if(this.returning==='*') return ' returning *';
    const cols=this.returning.split(',').map(x=>x.trim()).filter(x=>/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x));
    return cols.length?` returning ${cols.map(ident).join(', ')}`:'';
  }

  private async execute():Promise<Result>{
    try{
      const p=pool();
      if(this.action==='select'){
        const params:any[]=[];
        const rel=this.relationSelect();
        const prefix='t';
        const where=this.where(params,prefix);
        if(this.options?.count==='exact'&&this.options?.head){
          const r=await p.query(`select count(*)::int as count from ${ident(this.table)} ${prefix}${where}`,params);
          return {data:null,error:null,count:Number(r.rows[0]?.count||0)};
        }
        let selection:string;
        let join='';
        if(rel){selection=rel.select;join=rel.join;}
        else if(this.selected==='*') selection='t.*';
        else selection=this.selected.split(',').map(x=>x.trim()).filter(Boolean).map(x=>`t.${ident(x)}`).join(', ');
        let sql=`select ${selection} from ${ident(this.table)} ${prefix}${join}${where}`;
        if(this.orders.length) sql+=' order by '+this.orders.map(o=>`t.${ident(o.column)} ${o.ascending?'asc':'desc'}`).join(', ');
        if(this.maxRows!==undefined){params.push(this.maxRows);sql+=` limit $${params.length}`;}
        const r=await p.query(sql,params);
        if(this.singleMode){
          if(this.singleMode==='single'&&r.rows.length!==1) return {data:null,error:new Error(`Expected one row, got ${r.rows.length}`)};
          return {data:r.rows[0]??null,error:null};
        }
        return {data:r.rows,error:null};
      }

      if(this.action==='insert'||this.action==='upsert'){
        const rows=Array.isArray(this.values)?this.values:[this.values];
        if(!rows.length) return {data:[],error:null};
        const keys=Object.keys(rows[0]);
        if(!keys.length) throw new Error('Insert requires values');
        const params:any[]=[];
        const groups=rows.map(row=>'('+keys.map(k=>{params.push(row[k]);return `$${params.length}`;}).join(',')+')');
        let sql=`insert into ${ident(this.table)} (${keys.map(ident).join(',')}) values ${groups.join(',')}`;
        if(this.action==='upsert'){
          const conflicts=this.conflict.split(',').map(x=>x.trim()).filter(Boolean);
          if(!conflicts.length) throw new Error('Upsert requires onConflict');
          const updates=keys.filter(k=>!conflicts.includes(k));
          sql+=` on conflict (${conflicts.map(ident).join(',')}) `+(updates.length?`do update set ${updates.map(k=>`${ident(k)}=excluded.${ident(k)}`).join(',')}`:'do nothing');
        }
        sql+=this.returningSql();
        const r=await p.query(sql,params);
        if(this.singleMode){
          if(this.singleMode==='single'&&r.rows.length!==1) return {data:null,error:new Error(`Expected one row, got ${r.rows.length}`)};
          return {data:r.rows[0]??null,error:null};
        }
        return {data:this.returning?r.rows:null,error:null};
      }

      if(this.action==='update'){
        const keys=Object.keys(this.values||{}); if(!keys.length) throw new Error('Update requires values');
        const params:any[]=[];
        const sets=keys.map(k=>{params.push(this.values[k]);return `${ident(k)}=$${params.length}`;});
        const where=this.where(params,'t');
        // UPDATE aliases are valid in PostgreSQL, but qualified columns are not allowed on SET lhs.
        let sql=`update ${ident(this.table)} as t set ${sets.join(', ')}${where}${this.returningSql()}`;
        const r=await p.query(sql,params);
        if(this.singleMode){
          if(this.singleMode==='single'&&r.rows.length!==1) return {data:null,error:new Error(`Expected one row, got ${r.rows.length}`)};
          return {data:r.rows[0]??null,error:null};
        }
        return {data:this.returning?r.rows:null,error:null};
      }
      return {data:null,error:null};
    }catch(error){return {data:null,error,count:null};}
  }
}

class DatabaseClient{ from(table:string){return new QueryBuilder(table);} }
const dbClient=new DatabaseClient();
export function adminDb(){return dbClient;}
export async function sql(text:string,params:any[]=[]){return pool().query(text,params);}
