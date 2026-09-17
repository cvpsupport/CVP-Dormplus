'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { useWorkspace } from '@/lib/workspace';

type ChannelName = 'inapp' | 'line' | 'discord' | 'telegram';
type Channel = {
  id: string;
  channel: ChannelName;
  enabled: boolean;
  label: string | null;
  config: Record<string, unknown>;
  configured: boolean;
};
type Rule = { id:string; event_key:string; enabled:boolean; channels:string[]; days_before:number };

type Draft = {
  enabled: boolean;
  target_id?: string;
  chat_id?: string;
  channel_access_token?: string;
  webhook_url?: string;
  bot_token?: string;
};

const channelMeta: Record<ChannelName, { title:string; subtitle:string; icon:string }> = {
  inapp: { title:'In-App', subtitle:'แจ้งเตือนในหน้า DormPlus และไอคอนกระดิ่ง', icon:'bell' },
  line: { title:'LINE Official Account', subtitle:'Messaging API Push Message — ใช้ Channel access token + Target ID', icon:'message' },
  discord: { title:'Discord', subtitle:'ส่งเข้า Channel ด้วย Incoming Webhook', icon:'message' },
  telegram: { title:'Telegram', subtitle:'ส่งผ่าน Telegram Bot ไปยัง Chat ID', icon:'message' },
};

const ruleMeta: Record<string, { title:string; subtitle:string }> = {
  invoice_due: { title:'ใบแจ้งหนี้ใกล้ครบกำหนด', subtitle:'แจ้งก่อนวันครบกำหนดตามจำนวนวันที่ตั้งไว้' },
  payment_received: { title:'รับชำระเงิน', subtitle:'สำหรับต่อยอดเมื่อบันทึก Payment สำเร็จ' },
  maintenance_new: { title:'มีรายการแจ้งซ่อมใหม่', subtitle:'แจ้งทันทีเมื่อสร้าง Ticket ใหม่' },
  contract_expiring: { title:'สัญญาใกล้หมดอายุ', subtitle:'แจ้งล่วงหน้าก่อนวันสิ้นสุดสัญญา' },
  meter_anomaly: { title:'มิเตอร์ผิดปกติ', subtitle:'แจ้งเมื่อบันทึกหน่วยใช้งานสูงเกินเกณฑ์ของโครงการ' },
};

export function NotificationSettings({ onMessage }: { onMessage: (message:string, tone:'success'|'error')=>void }) {
  const workspace = useWorkspace();
  const [channels,setChannels]=useState<Channel[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [drafts,setDrafts]=useState<Record<ChannelName,Draft>>({
    inapp:{enabled:true}, line:{enabled:false,target_id:'',channel_access_token:''},
    discord:{enabled:false,webhook_url:''}, telegram:{enabled:false,chat_id:'',bot_token:''}
  });
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState<string|null>(null);

  const channelMap=useMemo(()=>new Map(channels.map(c=>[c.channel,c])),[channels]);

  async function load(){
    if(!workspace.activePropertyId||!workspace.supabase){setChannels([]);setRules([]);return;}
    setLoading(true);
    try{
      const [res,ruleRes]=await Promise.all([
        fetch(`/api/notification-channels?propertyId=${encodeURIComponent(workspace.activePropertyId)}`,{cache:'no-store'}),
        workspace.supabase.from('notification_rules').select('id,event_key,enabled,channels,days_before').eq('property_id',workspace.activePropertyId).order('event_key')
      ]);
      const json=await res.json();
      if(!res.ok) throw new Error(json.error||'โหลดช่องทางแจ้งเตือนไม่สำเร็จ');
      const rows=(json.channels||[]) as Channel[];
      setChannels(rows);
      if(ruleRes.error) throw ruleRes.error;
      setRules((ruleRes.data||[]) as Rule[]);
      const next={...drafts};
      for(const row of rows){
        const config=row.config||{};
        next[row.channel]={
          ...next[row.channel],
          enabled:row.enabled,
          target_id:typeof config.target_id==='string'?config.target_id:next[row.channel].target_id,
          chat_id:typeof config.chat_id==='string'?config.chat_id:next[row.channel].chat_id,
          channel_access_token:'', webhook_url:'', bot_token:''
        };
      }
      setDrafts(next);
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load();},[workspace.activePropertyId]);

  function setDraft(channel:ChannelName,patch:Partial<Draft>){setDrafts(prev=>({...prev,[channel]:{...prev[channel],...patch}}))}

  async function saveChannel(channel:ChannelName){
    if(!workspace.activePropertyId)return;
    setWorking(`save-${channel}`);
    try{
      const d=drafts[channel];
      const config:Record<string,string>={}; const secret:Record<string,string>={};
      if(channel==='line'){config.target_id=d.target_id||''; if(d.channel_access_token)secret.channel_access_token=d.channel_access_token;}
      if(channel==='discord'&&d.webhook_url)secret.webhook_url=d.webhook_url;
      if(channel==='telegram'){config.chat_id=d.chat_id||''; if(d.bot_token)secret.bot_token=d.bot_token;}
      const res=await fetch('/api/notification-channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId,channel,enabled:d.enabled,label:channelMeta[channel].title,config,secret})});
      const json=await res.json(); if(!res.ok)throw new Error(json.error||'บันทึกไม่สำเร็จ');
      onMessage(`บันทึก ${channelMeta[channel].title} แล้ว`,'success');
      await load();
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setWorking(null)}
  }

  async function testChannel(channel:ChannelName){
    if(!workspace.activePropertyId)return;
    setWorking(`test-${channel}`);
    try{
      const res=await fetch('/api/notifications/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId:workspace.activePropertyId,channel})});
      const json=await res.json(); if(!res.ok)throw new Error(json.error||'ทดสอบไม่สำเร็จ');
      onMessage(`ส่งข้อความทดสอบผ่าน ${channelMeta[channel].title} แล้ว`,'success');
    }catch(error){onMessage(error instanceof Error?error.message:String(error),'error')}
    finally{setWorking(null)}
  }

  async function updateRule(rule:Rule,patch:Partial<Rule>){
    if(!workspace.supabase)return;
    const next={...rule,...patch};
    setRules(prev=>prev.map(r=>r.id===rule.id?next:r));
    const {error}=await workspace.supabase.from('notification_rules').update({enabled:next.enabled,channels:next.channels,days_before:next.days_before,updated_at:new Date().toISOString()}).eq('id',rule.id);
    if(error){onMessage(error.message,'error');await load();}
  }

  function toggleRuleChannel(rule:Rule,channel:ChannelName){
    const set=new Set(rule.channels||[]); if(set.has(channel))set.delete(channel);else set.add(channel);
    void updateRule(rule,{channels:Array.from(set)});
  }

  if(!workspace.activePropertyId)return null;
  return <>
    <section className="panel notification-settings-panel">
      <div className="settings-section-head"><div><span className="settings-kicker">Notification Channels</span><h3>ช่องทางแจ้งเตือน</h3><p>Secret ของ LINE / Discord / Telegram จะถูกเก็บฝั่ง Server เท่านั้น ไม่ถูกส่งกลับมาแสดงใน Browser</p></div>{loading&&<span className="muted-note">กำลังโหลด...</span>}</div>
      <div className="notification-channel-grid">
        {(Object.keys(channelMeta) as ChannelName[]).map(channel=>{
          const meta=channelMeta[channel], d=drafts[channel], saved=channelMap.get(channel);
          return <article className={`notification-channel-card ${d.enabled?'enabled':''}`} key={channel}>
            <div className="notification-channel-head"><div className="channel-icon"><Icon name={meta.icon} size={20}/></div><div><h4>{meta.title}</h4><p>{meta.subtitle}</p></div><label className="switch"><input type="checkbox" checked={d.enabled} onChange={e=>setDraft(channel,{enabled:e.target.checked})}/><span/></label></div>
            {channel==='line'&&<div className="channel-fields"><label>Target ID<input value={d.target_id||''} onChange={e=>setDraft(channel,{target_id:e.target.value})} placeholder="U... หรือ C..."/></label><label>Channel access token<input type="password" value={d.channel_access_token||''} onChange={e=>setDraft(channel,{channel_access_token:e.target.value})} placeholder={saved?.configured?'ตั้งค่าแล้ว — กรอกใหม่เมื่อต้องการเปลี่ยน':'วาง token ที่นี่'}/></label></div>}
            {channel==='discord'&&<div className="channel-fields"><label>Webhook URL<input type="password" value={d.webhook_url||''} onChange={e=>setDraft(channel,{webhook_url:e.target.value})} placeholder={saved?.configured?'ตั้งค่าแล้ว — กรอกใหม่เมื่อต้องการเปลี่ยน':'https://discord.com/api/webhooks/...'} /></label></div>}
            {channel==='telegram'&&<div className="channel-fields"><label>Chat ID<input value={d.chat_id||''} onChange={e=>setDraft(channel,{chat_id:e.target.value})} placeholder="เช่น -1001234567890"/></label><label>Bot Token<input type="password" value={d.bot_token||''} onChange={e=>setDraft(channel,{bot_token:e.target.value})} placeholder={saved?.configured?'ตั้งค่าแล้ว — กรอกใหม่เมื่อต้องการเปลี่ยน':'123456:ABC...'} /></label></div>}
            {channel==='inapp'&&<div className="channel-info"><Icon name="shield" size={17}/><span>พร้อมใช้งานทันที ไม่ต้องใช้ token เพิ่มเติม</span></div>}
            <div className="channel-actions"><span className={saved?.configured?'config-ok':'config-warn'}>{saved?.configured?'● ตั้งค่าแล้ว':'○ ยังไม่ครบ'}</span><div><button type="button" className="outline-btn" onClick={()=>void testChannel(channel)} disabled={working!==null||!d.enabled}>{working===`test-${channel}`?'กำลังทดสอบ...':'ทดสอบ'}</button><button type="button" className="primary-btn" onClick={()=>void saveChannel(channel)} disabled={working!==null}>{working===`save-${channel}`?'กำลังบันทึก...':'บันทึก'}</button></div></div>
          </article>
        })}
      </div>
    </section>

    <section className="panel notification-rules-panel">
      <div className="settings-section-head"><div><span className="settings-kicker">Automation Rules</span><h3>เหตุการณ์ที่ต้องแจ้งเตือน</h3><p>เลือกช่องทางสำหรับแต่ละเหตุการณ์ ระบบ Cron จะตรวจใบแจ้งหนี้และสัญญาทุกเช้า</p></div></div>
      <div className="rule-list">{rules.map(rule=>{const meta=ruleMeta[rule.event_key]||{title:rule.event_key,subtitle:''};return <div className="notification-rule" key={rule.id}><div className="rule-copy"><label className="switch"><input type="checkbox" checked={rule.enabled} onChange={e=>void updateRule(rule,{enabled:e.target.checked})}/><span/></label><div><b>{meta.title}</b><small>{meta.subtitle}</small></div></div><div className="rule-options"><div className="rule-channels">{(['inapp','line','discord','telegram'] as ChannelName[]).map(ch=><button type="button" key={ch} className={(rule.channels||[]).includes(ch)?'active':''} onClick={()=>toggleRuleChannel(rule,ch)}>{ch==='inapp'?'In-App':ch==='line'?'LINE':ch==='discord'?'Discord':'Telegram'}</button>)}</div>{['invoice_due','contract_expiring'].includes(rule.event_key)&&<label className="days-before">ล่วงหน้า <input type="number" min="0" max="90" value={rule.days_before} onChange={e=>void updateRule(rule,{days_before:Number(e.target.value)||0})}/> วัน</label>}</div></div>})}</div>
    </section>
  </>;
}
