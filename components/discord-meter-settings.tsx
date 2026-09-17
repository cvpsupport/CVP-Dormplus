'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { useWorkspace } from '@/lib/workspace';

type Building = { id: string; name: string };
type Mapping = {
  id: string;
  property_id: string;
  building_id: string | null;
  guild_id: string;
  channel_id: string;
  enabled: boolean;
};
type ConfigStatus = { applicationId:boolean; publicKey:boolean; botToken:boolean };
type Draft = { guildId:string; channelId:string; buildingId:string; enabled:boolean };
const emptyDraft: Draft = { guildId:'', channelId:'', buildingId:'', enabled:true };

export function DiscordMeterSettings({ onMessage }:{ onMessage:(message:string,tone:'success'|'error')=>void }) {
  const workspace = useWorkspace();
  const [buildings,setBuildings] = useState<Building[]>([]);
  const [mappings,setMappings] = useState<Mapping[]>([]);
  const [config,setConfig] = useState<ConfigStatus>({applicationId:false,publicKey:false,botToken:false});
  const [draft,setDraft] = useState<Draft>(emptyDraft);
  const [working,setWorking] = useState<string|null>(null);
  const [origin,setOrigin] = useState('');

  const buildingMap = useMemo(()=>new Map(buildings.map(b=>[b.id,b.name])),[buildings]);

  async function load(){
    if(!workspace.activePropertyId||!workspace.supabase){setMappings([]);setBuildings([]);return;}
    try{
      const [buildingRes,settingsRes] = await Promise.all([
        workspace.supabase.from('buildings').select('id,name').eq('property_id',workspace.activePropertyId).order('name'),
        fetch(`/api/discord-meter-settings?propertyId=${encodeURIComponent(workspace.activePropertyId)}`,{cache:'no-store'}),
      ]);
      if(buildingRes.error) throw buildingRes.error;
      const json = await settingsRes.json();
      if(!settingsRes.ok) throw new Error(json.error||'โหลดการตั้งค่า Discord Meter ไม่สำเร็จ');
      const rows=(buildingRes.data||[]) as Building[];
      setBuildings(rows);
      setMappings((json.mappings||[]) as Mapping[]);
      setConfig(json.configured||{});
      const first=(json.mappings||[])[0] as Mapping|undefined;
      setDraft(first?{
        guildId:first.guild_id,
        channelId:first.channel_id,
        buildingId:first.building_id||'',
        enabled:first.enabled,
      }:{...emptyDraft,buildingId:rows.length===1?rows[0].id:''});
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
  }

  useEffect(()=>{setOrigin(window.location.origin);void load();},[workspace.activePropertyId]);

  async function save(){
    if(!workspace.activePropertyId)return;
    setWorking('save');
    try{
      const res=await fetch('/api/discord-meter-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        propertyId:workspace.activePropertyId,
        guildId:draft.guildId,
        channelId:draft.channelId,
        buildingId:draft.buildingId||null,
        enabled:draft.enabled,
      })});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'บันทึกไม่สำเร็จ');
      onMessage('บันทึก Discord Channel สำหรับส่งเลขมิเตอร์แล้ว','success');
      await load();
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setWorking(null)}
  }

  async function register(){
    if(!workspace.activePropertyId)return;
    setWorking('register');
    try{
      const res=await fetch('/api/discord/register-commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId})});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'ลงทะเบียนคำสั่ง Discord ไม่สำเร็จ');
      onMessage('อัปเดต /water และ /electric ใน Discord แล้ว','success');
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setWorking(null)}
  }

  async function remove(id:string){
    if(!workspace.activePropertyId||!confirm('ยกเลิกการผูก Discord Channel นี้?'))return;
    setWorking(`delete-${id}`);
    try{
      const res=await fetch('/api/discord-meter-settings',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId,id})});
      const json=await res.json();if(!res.ok)throw new Error(json.error||'ลบไม่สำเร็จ');
      onMessage('ยกเลิกการผูก Discord Channel แล้ว','success');await load();
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setWorking(null)}
  }

  if(!workspace.activePropertyId)return null;
  const envReady=config.applicationId&&config.publicKey&&config.botToken;
  return <section className="panel discord-meter-panel">
    <div className="settings-section-head">
      <div>
        <span className="settings-kicker">Discord Meter Capture</span>
        <h3>พิมพ์เลขมิเตอร์ + แนบรูป แล้วรออนุมัติ</h3>
        <p>พนักงานพิมพ์เลขที่เห็นจากหน้าปัดเองและแนบรูปเป็นหลักฐาน ระบบจะเก็บเป็นรายการรอตรวจสอบก่อน <b>ยังไม่ลงมิเตอร์จริง</b> จนกว่า Owner / Manager จะกดอนุมัติในหน้า “มิเตอร์น้ำ / ไฟ”</p>
      </div>
      <span className={envReady?'config-ok':'config-warn'}>{envReady?'● Server พร้อม':'○ Environment ยังไม่ครบ'}</span>
    </div>

    <div className="discord-meter-command-samples">
      <code>/water room:102 reading:1239 photo:[รูป]</code>
      <code>/electric room:102 reading:2317 photo:[รูป]</code>
    </div>

    <div className="discord-meter-env-grid manual">
      <span className={config.applicationId?'ok':''}>Application ID</span>
      <span className={config.publicKey?'ok':''}>Public Key</span>
      <span className={config.botToken?'ok':''}>Bot Token</span>
    </div>

    <div className="discord-endpoint-box">
      <div><Icon name="shield" size={18}/><div><b>Interactions Endpoint URL</b><small>นำ URL นี้ไปใส่ใน Discord Developer Portal → General Information</small></div></div>
      <code>{origin?`${origin}/api/discord/interactions`:'/api/discord/interactions'}</code>
    </div>

    <div className="discord-meter-form">
      <label>Discord Guild / Server ID<input value={draft.guildId} onChange={e=>setDraft({...draft,guildId:e.target.value})} placeholder="เช่น 123456789012345678"/></label>
      <label>Discord Channel ID<input value={draft.channelId} onChange={e=>setDraft({...draft,channelId:e.target.value})} placeholder="Channel ที่พนักงานส่งเลขและรูป"/></label>
      <label>อาคาร<select value={draft.buildingId} onChange={e=>setDraft({...draft,buildingId:e.target.value})}><option value="">ทุกอาคารในโครงการ</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="discord-meter-enabled"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/> เปิดรับคำสั่งใน Channel นี้</label>
    </div>

    <div className="discord-meter-actions">
      <button type="button" className="primary-btn" onClick={()=>void save()} disabled={working!==null||!draft.guildId||!draft.channelId}>{working==='save'?'กำลังบันทึก...':'บันทึก Channel'}</button>
      <button type="button" className="outline-btn" onClick={()=>void register()} disabled={working!==null||!mappings.length||!config.applicationId||!config.botToken}>{working==='register'?'กำลังลงทะเบียน...':'อัปเดต /water และ /electric'}</button>
    </div>

    {!!mappings.length&&<div className="discord-mapping-list">
      {mappings.map(row=><div className="discord-mapping-row" key={row.id}>
        <div><b>Channel {row.channel_id}</b><span>Guild {row.guild_id} · {row.building_id?buildingMap.get(row.building_id)||'อาคาร':'ทุกอาคาร'} · ต้องอนุมัติก่อนบันทึก</span></div>
        <span className={row.enabled?'config-ok':'config-warn'}>{row.enabled?'เปิดใช้งาน':'ปิดใช้งาน'}</span>
        <button type="button" className="danger-outline-btn" onClick={()=>void remove(row.id)} disabled={working!==null}>{working===`delete-${row.id}`?'กำลังลบ...':'ยกเลิก'}</button>
      </div>)}
    </div>}

    <div className="discord-meter-note"><Icon name="shield" size={17}/><span><b>ไม่ใช้ AI และไม่ต้องมี OPENAI_API_KEY</b> เลขมิเตอร์ที่พนักงานพิมพ์จะถูกเก็บคู่กับรูปต้นฉบับ และ Owner / Manager ต้องตรวจรูปก่อนกดอนุมัติทุกครั้ง</span></div>
  </section>;
}
