'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CrudMenu, EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { setStoredPropertyId, useWorkspace, type WorkspaceProperty } from '@/lib/workspace';

type ProjectRow = WorkspaceProperty & { created_at?: string; room_count?: number; occupied_count?: number; building_count?: number };
const statusLabel: Record<string,string> = { active: 'เปิดให้บริการ', planning: 'เตรียมเปิด', renovation: 'ปรับปรุง', inactive: 'ปิดใช้งาน' };
const statusTone: Record<string,string> = { active: 'green', planning: 'blue', renovation: 'amber', inactive: 'gray' };
const typeLabel: Record<string,string> = { dormitory:'หอพัก', apartment:'อพาร์ตเมนต์', student_apartment:'อพาร์ตเมนต์นักศึกษา', serviced_apartment:'เซอร์วิสอพาร์ตเมนต์', other:'อื่น ๆ' };

const emptyForm = { name:'', code:'', project_type:'dormitory', address:'', phone:'', description:'', status:'active' };

export default function ProjectsPage() {
  const workspace = useWorkspace();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{message:string;tone:'success'|'error'}|null>(null);

  async function load() {
    if (!workspace.supabase) return;
    const { data, error } = await workspace.supabase.from('properties').select('id,name,code,address,status,project_type,phone,description,created_at').order('created_at');
    if (error) { setToast({message:error.message,tone:'error'}); return; }
    const base = (data || []) as ProjectRow[];
    const enriched = await Promise.all(base.map(async p => {
      const [{ count: roomCount }, { count: occupiedCount }, { count: buildingCount }] = await Promise.all([
        workspace.supabase!.from('rooms').select('*',{count:'exact',head:true}).eq('property_id',p.id).is('archived_at',null),
        workspace.supabase!.from('rooms').select('*',{count:'exact',head:true}).eq('property_id',p.id).eq('status','occupied').is('archived_at',null),
        workspace.supabase!.from('buildings').select('*',{count:'exact',head:true}).eq('property_id',p.id),
      ]);
      return { ...p, room_count: roomCount || 0, occupied_count: occupiedCount || 0, building_count: buildingCount || 0 };
    }));
    setProjects(enriched);
  }

  useEffect(()=>{ if (!workspace.loading) void load(); }, [workspace.loading]);

  function createNew(){ setEditing(null); setForm(emptyForm); setOpen(true); }
  function editProject(p: ProjectRow){ setEditing(p); setForm({ name:p.name, code:p.code||'', project_type:p.project_type||'dormitory', address:p.address||'', phone:p.phone||'', description:p.description||'', status:p.status||'active' }); setOpen(true); }

  async function submit(e: FormEvent){
    e.preventDefault(); if (!workspace.supabase) return;
    setSaving(true);
    if (editing) {
      const { error } = await workspace.supabase.from('properties').update({ name:form.name.trim(), code:form.code.trim()||null, project_type:form.project_type, address:form.address.trim()||null, phone:form.phone.trim()||null, description:form.description.trim()||null, status:form.status, updated_at:new Date().toISOString() }).eq('id', editing.id);
      if (error) setToast({message:error.message,tone:'error'}); else { setToast({message:'แก้ไขโครงการเรียบร้อย',tone:'success'}); setOpen(false); await load(); await workspace.refresh(); }
    } else {
      const { data, error } = await workspace.supabase.rpc('create_project', { p_name:form.name.trim(), p_code:form.code.trim()||null, p_project_type:form.project_type, p_address:form.address.trim()||null, p_phone:form.phone.trim()||null, p_description:form.description.trim()||null });
      if (error) setToast({message:error.message,tone:'error'}); else { if (data) { setStoredPropertyId(String(data)); if (form.status !== 'active') await workspace.supabase.from('properties').update({ status: form.status }).eq('id', String(data)); } setToast({message:'สร้างโครงการเรียบร้อย',tone:'success'}); setOpen(false); await workspace.refresh(); await load(); }
    }
    setSaving(false);
  }

  async function removeProject(p: ProjectRow){
    if (!workspace.supabase || !window.confirm(`ลบโครงการ “${p.name}” และข้อมูลภายในทั้งหมด? การดำเนินการนี้ย้อนกลับไม่ได้`)) return;
    const { error } = await workspace.supabase.from('properties').delete().eq('id',p.id);
    if (error) setToast({message:error.message,tone:'error'}); else { setToast({message:'ลบโครงการแล้ว',tone:'success'}); await workspace.refresh(); await load(); }
  }

  const filtered = projects.filter(p => `${p.name} ${p.code||''} ${p.address||''}`.toLowerCase().includes(search.toLowerCase()));
  const active = projects.filter(p=>p.status==='active').length;
  const totalRooms = projects.reduce((s,p)=>s+(p.room_count||0),0);
  const occupied = projects.reduce((s,p)=>s+(p.occupied_count||0),0);
  const occupancy = totalRooms ? Math.round(occupied/totalRooms*100) : 0;

  return <AppShell>
    <PageTitle title="โครงการ" subtitle="ข้อมูลจริงจาก Supabase — เพิ่ม แก้ไข และลบโครงการได้" action={workspace.can('projects.manage')?<button className="primary-btn" onClick={createNew}><Icon name="plus" size={18}/> เพิ่มโครงการ</button>:undefined}/>
    <section className="stats-grid project-stats">
      <StatCard icon="project" label="โครงการทั้งหมด" value={`${projects.length} โครงการ`} note={`${active} โครงการเปิดให้บริการ`} />
      <StatCard icon="rooms" label="ห้องรวมทั้งหมด" value={`${totalRooms} ห้อง`} note={`มีผู้เช่า ${occupied} ห้อง`} tone="blue" />
      <StatCard icon="users" label="อัตราเข้าพักรวม" value={`${occupancy}%`} note={`${Math.max(0,totalRooms-occupied)} ห้องยังว่าง`} tone="amber" />
      <StatCard icon="finance" label="สถานะระบบ" value="Live Data" note="เชื่อม Supabase แล้ว" />
    </section>
    <div className="toolbar project-toolbar"><div className="search-box"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อโครงการ, รหัส, ทำเล..."/></div></div>
    {!workspace.loading && !filtered.length ? <EmptyState title="ยังไม่มีโครงการ" description="สร้างโครงการแรกเพื่อเริ่มเพิ่มห้อง ผู้เช่า และรายการต่าง ๆ" action={workspace.can('projects.manage')?<button className="primary-btn" onClick={createNew}><Icon name="plus" size={17}/> เพิ่มโครงการ</button>:undefined}/> :
    <section className="projects-grid">{filtered.map(project=>{
      const rate = project.room_count ? Math.round((project.occupied_count||0)/(project.room_count||1)*100) : 0;
      return <article className="project-card" key={project.id}>
        <div className="project-cover"><div className="project-building-art"><span/><span/><span/></div><Badge tone={statusTone[project.status]||'gray'}>{statusLabel[project.status]||project.status}</Badge><div className="project-code">{project.code||'NO-CODE'}</div></div>
        <div className="project-body">
          <div className="project-title-row"><div><h3>{project.name}</h3><p>{typeLabel[project.project_type]||project.project_type}</p></div><div className="project-building-count"><Icon name="project" size={16}/>{project.building_count||0} อาคาร</div></div>
          <div className="project-location"><Icon name="map" size={15}/><span>{project.address||'ยังไม่ระบุที่อยู่'}</span></div>
          <div className="project-kpis"><div><span>ห้องทั้งหมด</span><b>{project.room_count||0}</b></div><div><span>มีผู้เช่า</span><b>{project.occupied_count||0}</b></div><div><span>อัตราเข้าพัก</span><b>{rate}%</b></div></div>
          <div className="occupancy-progress-head"><span>อัตราเข้าพัก</span><strong>{rate}%</strong></div><div className="progress-track"><i style={{width:`${rate}%`}}/></div>
          <div className="project-foot"><CrudMenu canEdit={workspace.can('projects.manage')} canDelete={workspace.isOwner} onEdit={()=>editProject(project)} onDelete={()=>void removeProject(project)}/><Link className="project-detail-btn" href={`/projects/${project.id}`}>ดูโครงการ <Icon name="chevron" size={15}/></Link></div>
        </div>
      </article>})}</section>}

    <Modal open={open} title={editing?'แก้ไขโครงการ':'เพิ่มโครงการ'} subtitle="ข้อมูลนี้จะถูกบันทึกลง Supabase" onClose={()=>setOpen(false)}>
      <form className="crud-form" onSubmit={submit}>
        <div className="form-grid"><label>ชื่อโครงการ<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>รหัสโครงการ<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="DP-001"/></label>
        <label>ประเภท<select value={form.project_type} onChange={e=>setForm({...form,project_type:e.target.value})}><option value="dormitory">หอพัก</option><option value="apartment">อพาร์ตเมนต์</option><option value="student_apartment">อพาร์ตเมนต์นักศึกษา</option><option value="serviced_apartment">เซอร์วิสอพาร์ตเมนต์</option><option value="other">อื่น ๆ</option></select></label>
        <label>สถานะ<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">เปิดให้บริการ</option><option value="planning">เตรียมเปิด</option><option value="renovation">ปรับปรุง</option><option value="inactive">ปิดใช้งาน</option></select></label>
        <label>เบอร์โทร<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="full">ที่อยู่<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label className="full">รายละเอียด<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div>
        <FormActions saving={saving} onCancel={()=>setOpen(false)} saveLabel={editing?'บันทึกการแก้ไข':'สร้างโครงการ'}/>
      </form>
    </Modal>
    <Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>;
}
