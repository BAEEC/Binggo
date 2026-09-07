# Business Survival — Global Shock Challenge

เกมตอบคำถามสำหรับรายวิชา Business Environment & Management

## Player flow
1. ตัวแทนทีมเปิด `index.html`
2. ตั้งชื่อทีม + ใส่รหัสห้อง เช่น `MGT13167`
3. เล่น 20 สถานการณ์ ลำดับคำถามถูกสุ่มในแต่ละทีม
4. แต่ละข้อมีเวลา 30 วินาที
5. คำตอบทำให้เสีย 0 / 10 / 20 HP
6. ถ้า HP = 0 เกมจบทันทีด้วยสถานะล้มละลาย
7. หน้าสรุปแสดงทุกเหตุการณ์ คำตอบ Damage และ HP หลังแต่ละข้อ

## Teacher monitor
เปิด `teacher.html?room=MGT13167` เพื่อดูจำนวนทีม HP ความคืบหน้า และอันดับ

### โหมดทดสอบ
ถ้ายังไม่ตั้ง Supabase หน้า Teacher Monitor จะเห็นเฉพาะข้อมูลจาก Browser เดียวกันผ่าน localStorage/BroadcastChannel

### เปิดใช้หลายอุปกรณ์จริง
1. สร้าง/เชื่อม Supabase project
2. รัน `supabase-schema.sql`
3. นำ Project URL และ anon/public key ใส่ใน `sync-config.js`

```js
window.SYNC_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY'
};
```

จากนั้นทุกอุปกรณ์ที่ใช้รหัสห้องเดียวกันจะอัปเดตคะแนนไปยัง Teacher Monitor

## Files
- `index.html` — Player UI
- `game.js` — game logic, timer, HP, randomization, audio, summary
- `questions.js` — 20 Global Shock questions
- `teacher.html` / `teacher.js` — Teacher Dashboard
- `sync.js` — local + Supabase sync adapter
- `sync-config.js` — backend config
- `style.css` — MGT classroom UI
