// js/auth.js (ฉบับแก้ไข)

// 1. ใส่ "กุญแจ" ที่คัดลอกมาจาก Supabase
const SUPABASE_URL = 'https://jvixnexwrczctouwmlkf.supabase.co'; // <-- ตรวจสอบว่าค่านี้ถูกต้อง
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2aXhuZXh3cmN6Y3RvdXdtbGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNTI3NTUsImV4cCI6MjA3MDkyODc1NX0.KceJ6reFzn7jD2h1QSfHQX8Ga2MxrC9MAGXNAXNpRoo'; // <-- ตรวจสอบว่าค่านี้ถูกต้อง

// 2. ดึงฟังก์ชัน createClient ออกมาจาก object ของ Supabase ก่อน
const { createClient } = supabase;

// 3. สร้างตัวเชื่อมต่อไปยัง Supabase โดยใช้ฟังก์ชันที่ดึงออกมา
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 4. จัดการฟอร์มล็อกอิน (ใช้ supabaseClient แทน supabase)
const loginForm = document.querySelector('#login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        const errorMessage = document.querySelector('#error-message');
        errorMessage.textContent = '';

        // *** เปลี่ยนจาก supabase เป็น supabaseClient ***
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            errorMessage.textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        } else {
            window.location.href = '/index.html';
        }
    });
}

// 5. ฟังก์ชันสำหรับ Logout (ใช้ supabaseClient แทน supabase)
async function logout() {
    // *** เปลี่ยนจาก supabase เป็น supabaseClient ***
    await supabaseClient.auth.signOut();
    window.location.href = '/login.html';
}

// 6. ฟังก์ชันป้องกันหน้า (ใช้ supabaseClient แทน supabase)
async function protectPage() {
    // *** เปลี่ยนจาก supabase เป็น supabaseClient ***
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = '/login.html';
    }
    return session;
}