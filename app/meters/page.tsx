'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';
import { MeterApprovalQueue } from '@/components/meter-approval-queue';

type Room={id:string;room_number:string;status:string;building_id:string|null};
type Building={id:string;name:string};
type Meter={id:string;room_id:string;meter_type:'water'|'electricity';label:string|null};
type Reading={id:string;room_id:string;meter_id:string;billing_period:string;previous_reading:number|null;current_reading:number|null;usage:number|null;rate:number|null;amount:number|null;metadata:Record<string,unknown>};

type ReadingForm={room_id:string;period:string;water_previous:string;water_current:string;water_rate:string;electric_previous:string;electric_current:string;electric_rate:string};
const monthNow=()=>new Date().toISOString().slice(0,7);
const emptyForm:ReadingForm={room_id:'',period:monthNow(),water_previous:'0',water_current:'',water_rate:'28',electric_previous:'0',electric_current:'',electric_rate:'8'};

function periodDate(period:string){return `${period}-01`}
function n(value:unknown){const x=Number(value);return Number.isFinite(x)?x:0}
function money(value:number){return `฿${value.toLocaleString('th-TH',{maximumFractionDigits:2})}`}

export default function MetersPage(){
  const workspace=useWorkspace();
  const [rooms,setRooms]=useState<Room[]>([]); const [buildings,setBuildings]=useState<Building[]>([]); const [meters,setMeters]=useState<Meter[]>([]); const [readings,setReadings]=useState<Reading[]>([]);
  const [period,setPeriod]=useState(monthNow()); const [search,setSearch]=useState(''); const [buildingFilter,setBuildingFilter]=useState(''); const [open,setOpen]=useState(false); const [form,setForm]=useState<ReadingForm>(emptyForm); const [saving,setSaving]=useState(false); const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);

  async function load(){
    if(!workspace.supabase||!workspace.activePropertyId){setRooms([]);setMeters([]);setReadings([]);return;}
    const pid=workspace.activePropertyId;
    const [roomRes,buildingRes,meterRes,readingRes]=await Promise.all([
      workspace.supabase.from('rooms').select('id,room_number,status,building_id').eq('property_id',pid).is('archived_at',null).order('room_number'),
      workspace.supabase.from('buildings').select('id,name').eq('property_id',pid).order('name'),
      workspace.supabase.from('meters').select('id,room_id,meter_type,label').eq('property_id',pid),
      workspace.supabase.from('meter_readings').select('id,room_id,meter_id,billing_period,previous_reading,current_reading,usage,rate,amount,metadata').eq('property_id',pid).order('billing_period',{ascending:false})
    ]);
    const firstError=roomRes.error||buildingRes.error||meterRes.error||readingRes.error;
    if(firstError){setToast({message:firstError.message,tone:'error'});return;}
    setRooms((roomRes.data||[]) as Room[]); setBuildings((buildingRes.data||[]) as Building[]); setMeters((meterRes.data||[]) as Meter[]); const all=(readingRes.data||[]) as Reading[]; setReadings(all);
    if(all.length){const latest=all.map(r=>r.billing_period.slice(0,7)).sort().at(-1);if(latest&&!all.some(r=>r.billing_period.startsWith(period)))setPeriod(latest)}
  }
  useEffect(()=>{setBuildingFilter('');void load();},[workspace.activePropertyId]);

  const buildingMap=useMemo(()=>new Map(buildings.map(b=>[b.id,b.name])),[buildings]);
  const meterByRoom=useMemo(()=>{const map=new Map<string,{water?:Meter;electricity?:Meter}>();for(const m of meters){const row=map.get(m.room_id)||{};row[m.meter_type]=m;map.set(m.room_id,row)}return map},[meters]);
  const periodReadings=useMemo(()=>readings.filter(r=>r.billing_period.startsWith(period)),[readings,period]);
  const readingMap=useMemo(()=>new Map(periodReadings.map(r=>[`${r.room_id}:${meters.find(m=>m.id===r.meter_id)?.meter_type||''}`,r])),[periodReadings,meters]);

  function previousFor(roomId:string,type:'water'|'electricity',targetPeriod:string){
    const meter=meterByRoom.get(roomId)?.[type]; if(!meter)return 0;
    const prior=readings.filter(r=>r.meter_id===meter.id&&r.billing_period<periodDate(targetPeriod)).sort((a,b)=>b.billing_period.localeCompare(a.billing_period))[0];
    return n(prior?.current_reading);
  }
  function openReading(room:Room){
    const water=readingMap.get(`${room.id}:water`), electric=readingMap.get(`${room.id}:electricity`);
    const p=period;
    setForm({room_id:room.id,period:p,
      water_previous:String(water?.previous_reading??previousFor(room.id,'water',p)),water_current:water?.current_reading==null?'':String(water.current_reading),water_rate:String(water?.rate??workspace.activeProperty?.water_rate??28),
      electric_previous:String(electric?.previous_reading??previousFor(room.id,'electricity',p)),electric_current:electric?.current_reading==null?'':String(electric.current_reading),electric_rate:String(electric?.rate??workspace.activeProperty?.electricity_rate??8)});
    setOpen(true);
  }

  async function ensureMeter(roomId:string,type:'water'|'electricity'){
    if(!workspace.supabase||!workspace.activePropertyId)throw new Error('ยังไม่ได้เลือกโครงการ');
    const existing=meterByRoom.get(roomId)?.[type]; if(existing)return existing;
    const {data,error}=await workspace.supabase.from('meters').upsert({property_id:workspace.activePropertyId,room_id:roomId,meter_type:type,label:type==='water'?'มิเตอร์น้ำ':'มิเตอร์ไฟ',status:'active'},{onConflict:'property_id,room_id,meter_type'}).select('id,room_id,meter_type,label').single();
    if(error)throw error; return data as Meter;
  }

  async function saveReading(e:FormEvent){
    e.preventDefault(); if(!workspace.supabase||!workspace.activePropertyId)return; setSaving(true);
    try{
      const wp=n(form.water_previous),wc=n(form.water_current),ep=n(form.electric_previous),ec=n(form.electric_current); if(!form.water_current||!form.electric_current)throw new Error('กรอกเลขมิเตอร์น้ำและไฟให้ครบ'); if(wc<wp||ec<ep)throw new Error('เลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่าครั้งก่อน');
      const waterUsage=wc-wp,electricUsage=ec-ep,waterRate=n(form.water_rate),electricRate=n(form.electric_rate); const minimum=n(workspace.activeProperty?.water_minimum_charge),service=n(workspace.activeProperty?.water_service_fee); const waterAmount=waterUsage===0?0:(minimum>0?Math.max(minimum,waterUsage*waterRate+service):waterUsage*waterRate); const electricAmount=electricUsage*electricRate;
      const [waterMeter,electricMeter]=await Promise.all([ensureMeter(form.room_id,'water'),ensureMeter(form.room_id,'electricity')]); const billPeriod=periodDate(form.period);
      const payloads=[{property_id:workspace.activePropertyId,room_id:form.room_id,meter_id:waterMeter.id,billing_period:billPeriod,previous_reading:wp,current_reading:wc,usage:waterUsage,rate:waterRate,amount:waterAmount,metadata:{minimum_charge:minimum,service_fee:service,source:'dormplus-ui'}},{property_id:workspace.activePropertyId,room_id:form.room_id,meter_id:electricMeter.id,billing_period:billPeriod,previous_reading:ep,current_reading:ec,usage:electricUsage,rate:electricRate,amount:electricAmount,metadata:{source:'dormplus-ui'}}];
      const {error}=await workspace.supabase.from('meter_readings').upsert(payloads,{onConflict:'meter_id,billing_period'}); if(error)throw error;
      const room=rooms.find(r=>r.id===form.room_id); const alerts:string[]=[]; if(waterUsage>n(workspace.activeProperty?.meter_high_usage_water||30))alerts.push(`น้ำ ${waterUsage.toLocaleString()} หน่วย`); if(electricUsage>n(workspace.activeProperty?.meter_high_usage_electricity||300))alerts.push(`ไฟ ${electricUsage.toLocaleString()} หน่วย`);
      if(alerts.length){await fetch('/api/notifications/dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId,eventKey:'meter_anomaly',title:`มิเตอร์ห้อง ${room?.room_number||'-'} ใช้งานสูง`,body:`${alerts.join(' · ')} ในรอบ ${form.period}`,severity:'warning',entityType:'room',entityId:form.room_id,dedupeKey:`meter-anomaly:${form.room_id}:${form.period}`})})}
      setToast({message:`บันทึกมิเตอร์ห้อง ${room?.room_number||''} แล้ว`,tone:'success'}); setOpen(false); setPeriod(form.period); await load();
    }catch(error){setToast({message:error instanceof Error?error.message:String(error),tone:'error'})}finally{setSaving(false)}
  }

  const buildingRooms=useMemo(()=>buildingFilter?rooms.filter(r=>r.building_id===buildingFilter):rooms,[rooms,buildingFilter]);
  const buildingRoomIds=useMemo(()=>new Set(buildingRooms.map(r=>r.id)),[buildingRooms]);
  const filteredPeriodReadings=useMemo(()=>periodReadings.filter(r=>buildingRoomIds.has(r.room_id)),[periodReadings,buildingRoomIds]);
  const visible=buildingRooms.filter(r=>r.room_number.toLowerCase().includes(search.toLowerCase())||(r.building_id?buildingMap.get(r.building_id)||'':'').toLowerCase().includes(search.toLowerCase()));
  const waterUsage=filteredPeriodReadings.filter(r=>meters.find(m=>m.id===r.meter_id)?.meter_type==='water').reduce((s,r)=>s+n(r.usage),0); const electricUsage=filteredPeriodReadings.filter(r=>meters.find(m=>m.id===r.meter_id)?.meter_type==='electricity').reduce((s,r)=>s+n(r.usage),0); const totalAmount=filteredPeriodReadings.reduce((s,r)=>s+n(r.amount),0); const completed=new Set(filteredPeriodReadings.map(r=>r.room_id)).size;

  return <AppShell><PageTitle title="มิเตอร์น้ำ / ไฟ" subtitle={workspace.activeProperty?`บันทึกเลขมิเตอร์และคำนวณค่าสาธารณูปโภค · ${workspace.activeProperty.name}`:'เลือกโครงการก่อนใช้งานมิเตอร์'} action={<label className="period-picker"><Icon name="calendar" size={17}/><input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label>}/>
    <MeterApprovalQueue buildingId={buildingFilter} onChanged={()=>void load()}/>
    <section className="stats-grid compact"><StatCard icon="meter" label="บันทึกแล้ว" value={`${completed}/${buildingRooms.length} ห้อง`} note={`รอบ ${period}`}/><StatCard icon="water" label="ใช้น้ำ" value={`${waterUsage.toLocaleString()} หน่วย`} note={`เรตหลัก ${workspace.activeProperty?.water_rate??'-'} บาท`} tone="blue"/><StatCard icon="bolt" label="ใช้ไฟ" value={`${electricUsage.toLocaleString()} หน่วย`} note={`เรตหลัก ${workspace.activeProperty?.electricity_rate??'-'} บาท`} tone="amber"/><StatCard icon="finance" label="ค่าน้ำไฟรวม" value={money(totalAmount)} note="ตามรายการมิเตอร์รอบนี้" tone="green"/></section>
    <div className="toolbar meter-toolbar"><div className="meter-filter-group"><div className="search-box"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาห้องหรืออาคาร..."/></div><label className="building-filter"><Icon name="project" size={17}/><span>อาคาร</span><select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)}><option value="">ทุกอาคาร ({rooms.length})</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name} ({rooms.filter(r=>r.building_id===b.id).length})</option>)}</select><Icon name="chevron-down" size={15}/></label></div><div className="meter-legend"><span><i className="water-dot"/> น้ำ</span><span><i className="electric-dot"/> ไฟ</span></div></div>
    {!workspace.activePropertyId?<EmptyState title="ยังไม่มีโครงการ" description="สร้างหรือเลือกโครงการก่อนใช้งานมิเตอร์"/>:!rooms.length?<EmptyState title="ยังไม่มีห้องพัก" description="เพิ่มห้องพักก่อน แล้วจึงบันทึกมิเตอร์น้ำและไฟ"/>:<section className="panel table-panel meter-table-panel"><div className="table-wrap"><table><thead><tr><th>ห้อง</th><th>อาคาร</th><th>น้ำ: ก่อน → ปัจจุบัน</th><th>หน่วยน้ำ</th><th>ค่าน้ำ</th><th>ไฟ: ก่อน → ปัจจุบัน</th><th>หน่วยไฟ</th><th>ค่าไฟ</th><th>สถานะ</th><th></th></tr></thead><tbody>{visible.map(room=>{const w=readingMap.get(`${room.id}:water`),e=readingMap.get(`${room.id}:electricity`);const done=Boolean(w&&e);return <tr key={room.id}><td><b>ห้อง {room.room_number}</b></td><td>{room.building_id?buildingMap.get(room.building_id)||'-':'-'}</td><td>{w?`${n(w.previous_reading).toLocaleString()} → ${n(w.current_reading).toLocaleString()}`:'-'}</td><td><b className="water-value">{w?n(w.usage).toLocaleString():'-'}</b></td><td>{w?money(n(w.amount)):'-'}</td><td>{e?`${n(e.previous_reading).toLocaleString()} → ${n(e.current_reading).toLocaleString()}`:'-'}</td><td><b className="electric-value">{e?n(e.usage).toLocaleString():'-'}</b></td><td>{e?money(n(e.amount)):'-'}</td><td><Badge tone={done?'green':'gray'}>{done?'บันทึกแล้ว':'รอบันทึก'}</Badge></td><td>{workspace.can('meters.record')?<button className="table-action-btn" onClick={()=>openReading(room)}>{done?'แก้ไข':'จดมิเตอร์'}</button>:<span className="muted-action">ดูอย่างเดียว</span>}</td></tr>})}</tbody></table></div></section>}
    <Modal open={open} title={`จดมิเตอร์ · ห้อง ${rooms.find(r=>r.id===form.room_id)?.room_number||''}`} subtitle="กรอกเลขมิเตอร์ปัจจุบัน ระบบจะคำนวณหน่วยและยอดให้" onClose={()=>setOpen(false)}><form className="crud-form" onSubmit={saveReading}><div className="form-grid"><label>รอบบิล<input type="month" required value={form.period} onChange={e=>setForm({...form,period:e.target.value})}/></label><span/>
      <div className="meter-form-heading water"><Icon name="water" size={19}/><b>มิเตอร์น้ำ</b></div><span/><label>ครั้งก่อน<input type="number" step="0.01" required value={form.water_previous} onChange={e=>setForm({...form,water_previous:e.target.value})}/></label><label>เลขปัจจุบัน<input type="number" step="0.01" required value={form.water_current} onChange={e=>setForm({...form,water_current:e.target.value})}/></label><label>บาท / หน่วย<input type="number" step="0.01" min="0" value={form.water_rate} onChange={e=>setForm({...form,water_rate:e.target.value})}/></label><div className="calculated-box">ใช้ <b>{Math.max(0,n(form.water_current)-n(form.water_previous)).toLocaleString()}</b> หน่วย</div>
      <div className="meter-form-heading electric"><Icon name="bolt" size={19}/><b>มิเตอร์ไฟ</b></div><span/><label>ครั้งก่อน<input type="number" step="0.01" required value={form.electric_previous} onChange={e=>setForm({...form,electric_previous:e.target.value})}/></label><label>เลขปัจจุบัน<input type="number" step="0.01" required value={form.electric_current} onChange={e=>setForm({...form,electric_current:e.target.value})}/></label><label>บาท / หน่วย<input type="number" step="0.01" min="0" value={form.electric_rate} onChange={e=>setForm({...form,electric_rate:e.target.value})}/></label><div className="calculated-box">ใช้ <b>{Math.max(0,n(form.electric_current)-n(form.electric_previous)).toLocaleString()}</b> หน่วย</div>
    </div><FormActions saving={saving} onCancel={()=>setOpen(false)} saveLabel="บันทึกมิเตอร์"/></form></Modal><Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>
}
