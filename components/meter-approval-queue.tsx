'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';

type Submission = {
  id:string;
  building_id:string|null;
  room_id:string|null;
  meter_type:'water'|'electricity';
  billing_period:string|null;
  discord_username:string|null;
  attachment_filename:string|null;
  submitted_reading:number|null;
  previous_reading:number|null;
  usage:number|null;
  rate:number|null;
  amount:number|null;
  review_reason:string|null;
  created_at:string;
  room_number:string;
  building_name:string;
  image_url:string|null;
};

function n(value:unknown){const x=Number(value);return Number.isFinite(x)?x:0}
function money(value:number|null){return value==null?'รอตรวจสอบ':`฿${n(value).toLocaleString('th-TH',{maximumFractionDigits:2})}`}
function dateTime(value:string){return new Date(value).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}

export function MeterApprovalQueue({buildingId,onChanged}:{buildingId:string;onChanged:()=>void}){
  const workspace=useWorkspace();
  const [rows,setRows]=useState<Submission[]>([]);
  const [canReview,setCanReview]=useState(false);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    if(!workspace.activePropertyId){setRows([]);return;}
    setLoading(true);setError(null);
    try{
      const params=new URLSearchParams({propertyId:workspace.activePropertyId});
      if(buildingId)params.set('buildingId',buildingId);
      const res=await fetch(`/api/discord-meter-submissions?${params.toString()}`,{cache:'no-store'});
      const json=await res.json();
      if(!res.ok)throw new Error(json.error||'โหลดรายการรออนุมัติไม่สำเร็จ');
      setRows((json.submissions||[]) as Submission[]);setCanReview(Boolean(json.canReview));
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  },[workspace.activePropertyId,buildingId]);

  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),20000);return()=>window.clearInterval(timer)},[load]);

  async function review(row:Submission,action:'approve'|'reject'){
    if(!workspace.activePropertyId)return;
    let note='';
    if(action==='approve'){
      if(!confirm(`อนุมัติเลขมิเตอร์${row.meter_type==='water'?'น้ำ':'ไฟ'} ห้อง ${row.room_number} = ${n(row.submitted_reading).toLocaleString('th-TH')} ?`))return;
    }else{
      const value=prompt('เหตุผลที่ไม่อนุมัติ (เช่น รูปไม่ชัด / พิมพ์เลขผิด)','');
      if(value===null)return;note=value.trim();
    }
    setWorking(row.id);setError(null);
    try{
      const res=await fetch('/api/discord-meter-submissions/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId,submissionId:row.id,action,note})});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'ตรวจสอบรายการไม่สำเร็จ');
      await load();onChanged();
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setWorking(null)}
  }

  if(!workspace.activePropertyId)return null;
  return <section className="panel meter-approval-panel">
    <div className="meter-approval-head">
      <div><span className="settings-kicker">Discord Approval</span><h3>รออนุมัติเลขมิเตอร์ <Badge tone={rows.length?'amber':'green'}>{rows.length} รายการ</Badge></h3><p>ตรวจเลขที่พนักงานพิมพ์เทียบกับรูปก่อนบันทึกเข้ามิเตอร์จริง</p></div>
      <button type="button" className="outline-btn compact-btn" onClick={()=>void load()} disabled={loading}><Icon name="refresh" size={16}/>{loading?'กำลังโหลด':'รีเฟรช'}</button>
    </div>
    {error&&<div className="approval-error">{error}</div>}
    {!rows.length&&!loading?<div className="approval-empty"><Icon name="shield" size={22}/><div><b>ไม่มีรายการรออนุมัติ</b><span>เมื่อพนักงานใช้ /water หรือ /electric รายการจะขึ้นที่นี่</span></div></div>:
    <div className="meter-approval-list">{rows.map(row=><article className="meter-approval-card" key={row.id}>
      <a className="meter-proof" href={row.image_url||'#'} target="_blank" rel="noreferrer" title="เปิดรูปหลักฐาน">
        {row.image_url?<img src={row.image_url} alt={`มิเตอร์ห้อง ${row.room_number}`}/>:<div className="proof-placeholder"><Icon name="meter" size={24}/></div>}
        <span>ดูรูปเต็ม</span>
      </a>
      <div className="meter-approval-copy">
        <div className="approval-title"><b>ห้อง {row.room_number}</b><Badge tone={row.meter_type==='water'?'blue':'amber'}>{row.meter_type==='water'?'น้ำ':'ไฟ'}</Badge><span>{row.building_name}</span></div>
        <div className="approval-reading"><div><small>ครั้งก่อน</small><strong>{row.previous_reading==null?'—':n(row.previous_reading).toLocaleString('th-TH')}</strong></div><span>→</span><div className="submitted"><small>พนักงานพิมพ์</small><strong>{n(row.submitted_reading).toLocaleString('th-TH')}</strong></div><div><small>ใช้</small><strong>{row.usage==null?'—':`${n(row.usage).toLocaleString('th-TH')} หน่วย`}</strong></div><div><small>ยอดประมาณ</small><strong>{money(row.amount)}</strong></div></div>
        <div className="approval-meta">ส่งโดย {row.discord_username||'Discord user'} · {dateTime(row.created_at)}{row.review_reason&&<span className="approval-warning"> · {row.review_reason}</span>}</div>
      </div>
      <div className="approval-actions">
        {canReview?<><button type="button" className="approve-btn" disabled={working!==null} onClick={()=>void review(row,'approve')}>{working===row.id?'กำลังบันทึก...':'อนุมัติ'}</button><button type="button" className="reject-btn" disabled={working!==null} onClick={()=>void review(row,'reject')}>ไม่อนุมัติ</button></>:<span className="muted-note">Owner / Manager เป็นผู้อนุมัติ</span>}
      </div>
    </article>)}</div>}
  </section>
}
