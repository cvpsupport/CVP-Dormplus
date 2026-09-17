export type RoomStatus = 'occupied' | 'vacant' | 'reserved' | 'maintenance';

export const rooms = [
  { id: '101', name: 'ห้อง 101', tenant: 'พิมพ์ชนก ใจดี', rent: 3500, status: 'occupied' as RoomStatus, due: 'ชำระแล้ว' },
  { id: '102', name: 'ห้อง 102', tenant: 'ณัฐวุฒิ แสงทอง', rent: 3500, status: 'occupied' as RoomStatus, due: 'รอชำระ' },
  { id: '103', name: 'ห้อง 103', tenant: '-', rent: 3800, status: 'vacant' as RoomStatus, due: '-' },
  { id: '104', name: 'ห้อง 104', tenant: 'กมลชนก พรมา', rent: 3800, status: 'occupied' as RoomStatus, due: 'ชำระแล้ว' },
  { id: '105', name: 'ห้อง 105', tenant: 'ธนภูมิ วงศ์ดี', rent: 3600, status: 'reserved' as RoomStatus, due: 'มัดจำแล้ว' },
  { id: '106', name: 'ห้อง 106', tenant: '-', rent: 3800, status: 'maintenance' as RoomStatus, due: '-' }
];

export const tenants = [
  { name: 'พิมพ์ชนก ใจดี', room: '101', phone: '08x-xxx-2104', contractEnd: '31 ธ.ค. 2569', status: 'ปกติ' },
  { name: 'ณัฐวุฒิ แสงทอง', room: '102', phone: '09x-xxx-8812', contractEnd: '30 พ.ย. 2569', status: 'ค้างชำระ' },
  { name: 'กมลชนก พรมา', room: '104', phone: '06x-xxx-4389', contractEnd: '31 ม.ค. 2570', status: 'ปกติ' },
  { name: 'ธนภูมิ วงศ์ดี', room: '105', phone: '08x-xxx-9466', contractEnd: '28 ก.พ. 2570', status: 'รอย้ายเข้า' }
];

export const invoices = [
  { no: 'INV-2609-001', room: '101', tenant: 'พิมพ์ชนก ใจดี', amount: 4350, due: '05 ก.ย. 2569', status: 'paid' },
  { no: 'INV-2609-002', room: '102', tenant: 'ณัฐวุฒิ แสงทอง', amount: 4680, due: '05 ก.ย. 2569', status: 'overdue' },
  { no: 'INV-2609-004', room: '104', tenant: 'กมลชนก พรมา', amount: 4290, due: '05 ก.ย. 2569', status: 'paid' },
  { no: 'INV-2609-005', room: '105', tenant: 'ธนภูมิ วงศ์ดี', amount: 3600, due: '20 ก.ย. 2569', status: 'pending' }
];

export const maintenance = [
  { id: 'MT-1042', room: '106', issue: 'แอร์ไม่เย็น', priority: 'สูง', assignee: 'ช่างเอก', status: 'กำลังดำเนินการ', time: '10:32' },
  { id: 'MT-1041', room: '203', issue: 'ก๊อกน้ำรั่ว', priority: 'กลาง', assignee: 'ช่างนัท', status: 'รออะไหล่', time: '09:15' },
  { id: 'MT-1040', room: '305', issue: 'หลอดไฟเสีย', priority: 'ต่ำ', assignee: 'ช่างเอก', status: 'ใหม่', time: '08:32' }
];

export type ProjectStatus = 'active' | 'planning' | 'renovation';

export type Project = {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string;
  manager: string;
  status: ProjectStatus;
  totalRooms: number;
  occupiedRooms: number;
  monthlyRevenue: number;
  openedAt: string;
  buildings: number;
  floors: number;
  description: string;
};

export const projects: Project[] = [
  {
    id: 'green-park',
    code: 'DP-001',
    name: 'Green Park Residence',
    type: 'หอพักรายเดือน',
    address: 'ลาดพร้าว 101, กรุงเทพฯ',
    manager: 'กอบ การ์ดเสริมพิเศษ',
    status: 'active',
    totalRooms: 48,
    occupiedRooms: 42,
    monthlyRevenue: 126500,
    openedAt: 'ม.ค. 2566',
    buildings: 1,
    floors: 5,
    description: 'โครงการหลักสำหรับห้องพักรายเดือน ใกล้แหล่งชุมชนและระบบขนส่งสาธารณะ'
  },
  {
    id: 'campus-house',
    code: 'DP-002',
    name: 'Campus House',
    type: 'อพาร์ตเมนต์นักศึกษา',
    address: 'รังสิต, ปทุมธานี',
    manager: 'พิมพ์ชนก ใจดี',
    status: 'active',
    totalRooms: 36,
    occupiedRooms: 34,
    monthlyRevenue: 109800,
    openedAt: 'มิ.ย. 2567',
    buildings: 1,
    floors: 4,
    description: 'อพาร์ตเมนต์สำหรับนักศึกษา เน้นสัญญารายเทอมและการชำระผ่านออนไลน์'
  },
  {
    id: 'river-view',
    code: 'DP-003',
    name: 'River View Apartment',
    type: 'อพาร์ตเมนต์',
    address: 'บางกรวย, นนทบุรี',
    manager: 'ณัฐวุฒิ แสงทอง',
    status: 'renovation',
    totalRooms: 32,
    occupiedRooms: 29,
    monthlyRevenue: 102600,
    openedAt: 'ส.ค. 2564',
    buildings: 2,
    floors: 4,
    description: 'โครงการสองอาคาร อยู่ระหว่างปรับปรุงพื้นที่ส่วนกลางและระบบ Access Control'
  },
  {
    id: 'north-garden',
    code: 'DP-004',
    name: 'North Garden Living',
    type: 'เซอร์วิสอพาร์ตเมนต์',
    address: 'เมืองเชียงใหม่, เชียงใหม่',
    manager: 'ยังไม่ระบุ',
    status: 'planning',
    totalRooms: 24,
    occupiedRooms: 0,
    monthlyRevenue: 0,
    openedAt: 'เป้าหมาย มี.ค. 2570',
    buildings: 1,
    floors: 3,
    description: 'โครงการใหม่อยู่ในขั้นเตรียมเปิดระบบ จัดทำห้อง ราคา และทีมงานก่อนเปิดให้เช่า'
  }
];

export const projectTasks = [
  { id: 'PJ-104', projectId: 'river-view', title: 'ติดตั้งกล้อง CCTV พื้นที่ส่วนกลาง', due: '25 ก.ย. 2569', assignee: 'ช่างเอก', status: 'กำลังทำ', priority: 'สูง' },
  { id: 'PJ-103', projectId: 'river-view', title: 'เปลี่ยนระบบคีย์การ์ดเป็น QR Access', due: '30 ก.ย. 2569', assignee: 'ทีมระบบ', status: 'รอดำเนินการ', priority: 'สูง' },
  { id: 'PJ-102', projectId: 'green-park', title: 'ตรวจสัญญาผู้เช่าที่จะหมดอายุ', due: '28 ก.ย. 2569', assignee: 'แอดมิน', status: 'กำลังทำ', priority: 'กลาง' },
  { id: 'PJ-101', projectId: 'north-garden', title: 'กำหนดราคาและประเภทห้อง', due: '10 ต.ค. 2569', assignee: 'เจ้าของโครงการ', status: 'รอดำเนินการ', priority: 'กลาง' }
];
