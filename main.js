// js/main.js (Final Version - with Individual QR Print)

document.addEventListener('DOMContentLoaded', async () => {
    if (await handleUrlRouting()) return;
    const session = await protectPage();
    if (!session) return;
    initApp();
});

// =============================================================================
//  PUBLIC ROUTING & SINGLE ROOM DASHBOARD
// =============================================================================
async function handleUrlRouting() {
    const hash = window.location.hash;
    const roomMatch = hash.match(/^#room=([a-zA-Z0-9\-_%]+)$/);
    if (roomMatch) {
        const roomName = decodeURIComponent(roomMatch[1]);
        document.querySelector('header').style.display = 'none';
        const mainContent = document.querySelector('main');
        mainContent.querySelectorAll('section[id^="tab-"]').forEach(sec => sec.style.display = 'none');
        const singleRoomView = document.getElementById('single-room-view');
        singleRoomView.classList.remove('hidden');
        singleRoomView.style.display = 'block';

        // !!! สำคัญ: แก้ URL และ KEY ตรงนี้ให้เป็นของคุณ !!!
        const SUPABASE_URL = 'https://jvixnexwrczctouwmlkf.supabase.co'; // <-- ตรวจสอบว่าค่านี้ถูกต้อง
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2aXhuZXh3cmN6Y3RvdXdtbGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNTI3NTUsImV4cCI6MjA3MDkyODc1NX0.KceJ6reFzn7jD2h1QSfHQX8Ga2MxrC9MAGXNAXNpRoo'; // <-- ตรวจสอบว่าค่านี้ถูกต้อง
        const { createClient } = supabase;
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        await renderSingleRoomDashboard(roomName, supabaseClient);
        return true;
    }
    return false;
}

async function renderSingleRoomDashboard(roomName, supabaseClient) {
    const $ = (sel) => document.querySelector(sel);
    $('#room-view-name').textContent = `กำลังโหลดข้อมูลห้อง ${roomName}...`;
    
    const { data: roomData, error: roomError } = await supabaseClient.from('evaluations').select(`*, rooms!inner(name), evaluation_photos(photo_url)`).eq('rooms.name', roomName).order('created_at', { ascending: false });
    const { data: allData, error: allError } = await supabaseClient.from('evaluations').select('total_score');

    if (roomError || !roomData || roomData.length === 0) {
        $('#room-view-name').textContent = `ไม่พบข้อมูลสำหรับห้อง ${roomName}`;
        $('#room-kpi-latest, #room-kpi-avg, #room-kpi-count, #room-kpi-overall-avg').textContent = '-';
        return;
    }

    $('#room-view-name').textContent = roomName;
    $('#room-kpi-latest').textContent = roomData[0].total_score;
    const roomTotalSum = roomData.reduce((sum, item) => sum + item.total_score, 0);
    $('#room-kpi-avg').textContent = (roomTotalSum / roomData.length).toFixed(1);
    $('#room-kpi-count').textContent = roomData.length;

    if (allData && allData.length > 0) {
        const overallTotalSum = allData.reduce((sum, item) => sum + item.total_score, 0);
        $('#room-kpi-overall-avg').textContent = (overallTotalSum / allData.length).toFixed(1);
    } else {
        $('#room-kpi-overall-avg').textContent = '-';
    }

    const categoryKeys = ['clean', 'tidy', 'board', 'energy', 'readiness'];
    const radarLabels = ['ความสะอาด', 'ระเบียบ', 'บอร์ด', 'พลังงาน', 'พร้อมใช้'];
    const radarData = categoryKeys.map(key => roomData.reduce((sum, item) => sum + (item.scores[key] || 0), 0) / roomData.length);
    drawPublicChart('room-radar-chart', 'radar', radarLabels, radarData, 'คะแนนเฉลี่ย');

    const sortedData = [...roomData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lineLabels = sortedData.map(item => new Date(item.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }));
    const lineData = sortedData.map(item => item.total_score);
    drawPublicChart('room-line-chart', 'line', lineLabels, lineData, 'คะแนน');
    
    const latestNoteEl = $('#room-latest-note');
    const latestNote = roomData[0].note;
    if (latestNote) {
        latestNoteEl.innerHTML = `<p class="text-slate-200">${latestNote.replace(/\n/g, '<br>')}</p>`;
    } else {
        latestNoteEl.innerHTML = `<p class="text-slate-400 text-sm italic">ไม่มีหมายเหตุ</p>`;
    }

    const photoGallery = $('#room-photo-gallery');
    const allPhotos = roomData.flatMap(item => item.evaluation_photos.map(p => p.photo_url));
    if (allPhotos.length > 0) {
        photoGallery.innerHTML = allPhotos.slice(0, 8).map(url => `<a href="${url}" target="_blank" class="block"><img src="${url}" class="w-full h-28 object-cover rounded-lg border-2 border-slate-700 hover:border-emerald-500"></a>`).join('');
    } else {
        photoGallery.innerHTML = '<p class="text-slate-400 text-sm">ไม่มีรูปภาพ</p>';
    }
}

let publicChartInstances = {};
function drawPublicChart(canvasId, type, labels, data, label) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (publicChartInstances[canvasId]) publicChartInstances[canvasId].destroy();
    const chartColors = { backgroundColor: 'rgba(22, 163, 74, 0.2)', borderColor: 'rgba(52, 211, 153, 1)', pointBackgroundColor: 'rgba(52, 211, 153, 1)', color: 'rgba(229, 231, 235, 0.8)' };
    if (type === 'radar') {
        chartColors.backgroundColor = 'rgba(52, 211, 153, 0.2)';
        chartColors.borderColor = 'rgba(52, 211, 153, 1)';
    }
    publicChartInstances[canvasId] = new Chart(ctx, {
        type, data: { labels, datasets: [{ label, data, ...chartColors, borderWidth: 1.5, tension: 0.1 }] },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartColors.color } } },
            scales: (type === 'line') ? { y: { ticks: { color: chartColors.color }, grid: { color: 'rgba(100, 116, 139, 0.2)' } }, x: { ticks: { color: chartColors.color }, grid: { color: 'rgba(100, 116, 139, 0.2)' } } }
            : (type === 'radar' ? { r: { beginAtZero: true, max: 10, ticks: { color: chartColors.color, backdropColor: 'transparent' }, grid: { color: 'rgba(100, 116, 139, 0.2)' }, pointLabels: { color: chartColors.color } } } : {})
        }
    });
}

// =============================================================================
//  MAIN APP FOR LOGGED-IN USERS
// =============================================================================
async function initApp() {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    let rooms = await fetchRooms();
    let allEvaluationsData = [];
    let chartInstance = null;
    let currentChartType = 'bar';

    function initUI() {
        renderRoomOptions(rooms);
        $$('.tabBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                $$('.tabBtn').forEach(b => b.classList.remove('tab-active'));
                e.currentTarget.classList.add('tab-active');
                $$('main > section').forEach(sec => sec.classList.add('hidden'));
                $(`#tab-${tab}`).classList.remove('hidden');
                if (tab === 'dashboard') renderAll();
                if (tab === 'manage') renderRoomList();
                if (tab === 'qr') renderQRCodes();
            });
        });
        $('#roomSearchInput')?.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(searchTerm));
            renderRoomOptions(filteredRooms, false);
        });
        $$('.chart-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.chart-type-btn').forEach(b => b.classList.remove('chart-type-active'));
                btn.classList.add('chart-type-active');
                currentChartType = btn.dataset.type;
                $('#barChartCategorySelector').classList.toggle('hidden', currentChartType !== 'bar');
                $('#timeGranularitySelector').classList.toggle('hidden', currentChartType !== 'line');
                renderAll();
            });
        });
        ['clean', 'tidy', 'board', 'energy', 'readiness'].forEach(id => {
            const slider = $('#' + id);
            const valueDisplay = $('#' + id + 'Val');
            if (slider && valueDisplay) {
                slider.addEventListener('input', () => {
                    valueDisplay.textContent = slider.value;
                    updateTotalScore();
                });
            }
        });
        $('#saveBtn')?.addEventListener('click', () => saveEvaluation());
        $('#resetBtn')?.addEventListener('click', resetForm);
        $('#printBtn')?.addEventListener('click', () => window.print());
        $('#addRoomBtn')?.addEventListener('click', addRoom);
        $('#timeGranularity')?.addEventListener('change', renderAll);
        $('#roomFilter')?.addEventListener('change', renderAll);
        $('#barCategory')?.addEventListener('change', renderAll);
        $('#summaryTimeRange')?.addEventListener('change', renderAll);
        $('#summaryDateFrom')?.addEventListener('change', renderAll);
        $('#summaryDateTo')?.addEventListener('change', renderAll);
        $('#closeModalBtn')?.addEventListener('click', closePhotoModal);
        
        $('#openRetroactiveModalBtn')?.addEventListener('click', openRetroactiveModal);
        $('#closeRetroactiveModalBtn')?.addEventListener('click', closeRetroactiveModal);
        $('#saveRetroactiveBtn')?.addEventListener('click', () => {
            const date = $('#retroactiveDate').value;
            const time = $('#retroactiveTime').value;
            if (!date || !time) {
                alert('กรุณากำหนดวันและเวลาให้ครบถ้วน');
                return;
            }
            const combinedDateTime = new Date(`${date}T${time}`);
            saveEvaluation(combinedDateTime);
        });

        $('#roomListContainer')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.delRoomBtn');
            if (btn) {
                const roomId = btn.dataset.roomId;
                const roomName = btn.dataset.roomName;
                if (confirm(`คุณแน่ใจว่าต้องการลบห้อง "${roomName}" ?`)) deleteRoom(roomId);
            }
        });
        $('#tableBody')?.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-photos-btn');
            const delBtn = e.target.closest('.delBtn');
            if (viewBtn) {
                const evaluationId = viewBtn.dataset.evaluationId;
                const record = allEvaluationsData.find(item => item.id === evaluationId);
                if (record && record.photos.length > 0) openPhotoModal(record.photos);
                else alert('ไม่มีรูปภาพสำหรับรายการนี้');
            }
            if (delBtn) {
                const idToDelete = delBtn.dataset.id;
                if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) deleteEvaluation(idToDelete);
            }
        });
        $('#qrCodeContainer')?.addEventListener('click', (e) => {
            const printBtn = e.target.closest('.print-qr-btn');
            if (printBtn) {
                const roomId = printBtn.dataset.roomId;
                printSingleQR(roomId);
            }
        });
    }

    async function fetchRooms() {
        const { data, error } = await supabaseClient.from('rooms').select('id, name').order('name');
        if (error) console.error("Error fetching rooms:", error);
        return data || [];
    }
    
    async function addRoom() {
        const input = $('#newRoomNameInput');
        const msg = $('#manageMsg');
        const roomName = input.value.trim();
        if (!roomName) return alert('กรุณาใส่ชื่อห้อง');
        const { data, error } = await supabaseClient.from('rooms').insert([{ name: roomName }]).select();
        if (error) {
            msg.textContent = error.code === '23505' ? `ผิดพลาด: มีห้อง "${roomName}" อยู่แล้ว` : `ผิดพลาด: ${error.message}`;
        } else {
            msg.textContent = `เพิ่มห้อง "${data[0].name}" เรียบร้อยแล้ว`;
            input.value = '';
            rooms = await fetchRooms();
            renderRoomList();
            renderRoomOptions(rooms, true);
        }
        setTimeout(() => msg.textContent = '', 4000);
    }

    async function deleteRoom(roomId) {
        const msg = $('#manageMsg');
        const { error } = await supabaseClient.from('rooms').delete().eq('id', roomId);
        if (error) {
            msg.textContent = `ผิดพลาดในการลบ: ${error.message}`;
        } else {
            msg.textContent = 'ลบห้องเรียบร้อยแล้ว';
            rooms = await fetchRooms();
            renderRoomList();
            renderRoomOptions(rooms, true);
        }
        setTimeout(() => msg.textContent = '', 4000);
    }

    async function fetchAllEvaluations() {
        const { data, error } = await supabaseClient.from('evaluations').select(`*, rooms(id, name), evaluation_photos(photo_url)`).order('created_at', { ascending: false });
        if (error) console.error("Error fetching evaluations:", error);
        allEvaluationsData = (data || []).map(e => ({ ...e, room: e.rooms?.name || 'N/A', photos: e.evaluation_photos.map(p => p.photo_url) }));
        return allEvaluationsData;
    }
    
    async function saveEvaluation(customTimestamp = null) {
        const saveMsg = $('#saveMsg');
        saveMsg.textContent = 'กำลังบันทึก...';
        closeRetroactiveModal();
        const roomId = $('#roomSelect').value;
        if (!roomId) {
            alert('กรุณาเลือกห้อง');
            saveMsg.textContent = '';
            return;
        }
        const scores = { clean: +$('#clean').value, tidy: +$('#tidy').value, board: +$('#board').value, energy: +$('#energy').value, readiness: +$('#readiness').value };
        const total_score = Object.values(scores).reduce((sum, val) => sum + val, 0);
        const note = $('#noteInput').value.trim();
        const files = $('#photoInput').files;
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่");
            const evaluationData = { room_id: roomId, scores, total_score, note, user_id: user.id, created_at: customTimestamp ? customTimestamp.toISOString() : new Date().toISOString() };
            const { data: evalData, error: evalError } = await supabaseClient.from('evaluations').insert([evaluationData]).select('id').single();
            if (evalError) throw evalError;
            const evaluationId = evalData.id;
            if (files.length > 0) {
                const uploadPromises = Array.from(files).map(async (file) => {
                    const filePath = `${user.id}/${evaluationId}/${Date.now()}_${file.name}`;
                    const { error: uploadError } = await supabaseClient.storage.from('evaluation-photos').upload(filePath, file);
                    if (uploadError) throw uploadError;
                    const { data } = supabaseClient.storage.from('evaluation-photos').getPublicUrl(filePath);
                    return { evaluation_id: evaluationId, photo_url: data.publicUrl };
                });
                const photoInsertData = await Promise.all(uploadPromises);
                await supabaseClient.from('evaluation_photos').insert(photoInsertData);
            }
            saveMsg.textContent = 'บันทึกเรียบร้อย 🎉';
            resetForm();
            await renderAll();
        } catch (error) {
            console.error('Save failed:', error);
            saveMsg.textContent = `เกิดข้อผิดพลาด: ${error.message}`;
        } finally {
            setTimeout(() => saveMsg.textContent = '', 5000);
        }
    }

    async function deleteEvaluation(evaluationId) {
        const { error } = await supabaseClient.from('evaluations').delete().eq('id', evaluationId);
        if (error) alert("ลบข้อมูลไม่สำเร็จ: " + error.message);
        else await renderAll();
    }

    async function renderAll() {
        const data = await fetchAllEvaluations();
        renderKPIs(data);
        renderSummarySection(data);
        renderDynamicChart(data);
        renderTable(data);
    }
    
    function renderKPIs(allData) {
        const roomId = $('#roomFilter')?.value || 'all';
        const data = (roomId === 'all') ? allData : allData.filter(item => item.rooms.id == roomId);
        const kpiAvg = $('#kpiAvg'), kpiCount = $('#kpiCount'), kpiBest = $('#kpiBest');
        if (!kpiAvg || !kpiCount || !kpiBest) return;
        if (data.length === 0) {
            kpiAvg.textContent = '-'; kpiCount.textContent = '0'; kpiBest.textContent = (roomId === 'all') ? '-' : 'ยังไม่มีข้อมูล';
            return;
        }
        const totalSum = data.reduce((sum, item) => sum + item.total_score, 0);
        kpiAvg.textContent = (totalSum / data.length).toFixed(1);
        kpiCount.textContent = data.length;
        if (roomId === 'all') {
            const scoresByRoom = allData.reduce((acc, item) => {
                if (!acc[item.room]) acc[item.room] = { total: 0, count: 0 };
                acc[item.room].total += item.total_score; acc[item.room].count++;
                return acc;
            }, {});
            let bestRoom = { name: '-', avg: 0 };
            for (const roomName in scoresByRoom) {
                const avg = scoresByRoom[roomName].total / scoresByRoom[roomName].count;
                if (avg > bestRoom.avg) bestRoom = { name: roomName, avg };
            }
            kpiBest.textContent = `${bestRoom.name} (${bestRoom.avg.toFixed(1)})`;
        } else { kpiBest.textContent = 'N/A'; }
    }
    
    function renderSummarySection(allData) {
        const timeRange = $('#summaryTimeRange').value;
        $('#customDateRange').classList.toggle('hidden', timeRange !== 'custom');
        let startDate = new Date(), endDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        if (timeRange === 'this_week') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(startDate.setDate(diff));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
        } else if (timeRange === 'this_month') {
            startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            endDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
        } else if (timeRange === 'custom') {
            const fromVal = $('#summaryDateFrom').value, toVal = $('#summaryDateTo').value;
            startDate = fromVal ? new Date(fromVal) : new Date('1970-01-01');
            endDate = toVal ? new Date(toVal) : new Date();
            endDate.setHours(23, 59, 59, 999);
        }
        const filteredData = allData.filter(item => new Date(item.created_at) >= startDate && new Date(item.created_at) <= endDate);
        const scoresByRoom = filteredData.reduce((acc, item) => {
            if (!acc[item.room]) acc[item.room] = [];
            acc[item.room].push(item.total_score);
            return acc;
        }, {});
        const roomAverages = Object.entries(scoresByRoom).map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length }));
        const bestRoomEl = $('#bestRoomDisplay'), bestScoreEl = $('#bestRoomScore');
        const worstRoomEl = $('#worstRoomDisplay'), worstScoreEl = $('#worstRoomScore');
        if (roomAverages.length > 0) {
            roomAverages.sort((a, b) => b.avg - a.avg);
            const best = roomAverages[0], worst = roomAverages[roomAverages.length - 1];
            bestRoomEl.textContent = best.name;
            bestScoreEl.textContent = `คะแนนเฉลี่ย: ${best.avg.toFixed(2)}`;
            worstRoomEl.textContent = worst.name;
            worstScoreEl.textContent = `คะแนนเฉลี่ย: ${worst.avg.toFixed(2)}`;
        } else {
            bestRoomEl.textContent = 'ไม่มีข้อมูล'; bestScoreEl.textContent = '';
            worstRoomEl.textContent = 'ไม่มีข้อมูล'; worstScoreEl.textContent = '';
        }
    }

    function renderDynamicChart(allData) {
        const granularity = $('#timeGranularity')?.value || 'daily';
        const roomId = $('#roomFilter')?.value || 'all';
        const data = (roomId === 'all') ? allData : allData.filter(item => item.rooms.id == roomId);
        let chartData = { labels: [], values: [] }, chartTitle = '';
        switch (currentChartType) {
            case 'bar':
                const category = $('#barCategory')?.value || 'total_score';
                const categoryText = $('#barCategory')?.options[$('#barCategory').selectedIndex].text || 'คะแนนรวม';
                chartTitle = `เปรียบเทียบ: ${categoryText}`;
                const scoresByRoom = allData.reduce((acc, item) => {
                    if (!acc[item.room]) acc[item.room] = [];
                    const score = (category === 'total_score') ? item.total_score : (item.scores[category] || 0);
                    acc[item.room].push(score);
                    return acc;
                }, {});
                chartData.labels = Object.keys(scoresByRoom).sort();
                chartData.values = chartData.labels.map(room => scoresByRoom[room].reduce((s, c) => s + c, 0) / scoresByRoom[room].length);
                break;
            case 'line':
                chartTitle = `แนวโน้มคะแนนเฉลี่ย`;
                const trendData = aggregateDataByTime(data, granularity);
                chartData.labels = trendData.labels;
                chartData.values = trendData.values;
                break;
            case 'radar':
                const roomName = (roomId === 'all') ? 'ทุกห้อง' : rooms.find(r => r.id == roomId)?.name || '';
                chartTitle = `ภาพรวมจุดแข็ง-จุดอ่อน (${roomName})`;
                const categoryKeys = ['clean', 'tidy', 'board', 'energy', 'readiness'];
                chartData.labels = ['ความสะอาด', 'ระเบียบ', 'บอร์ด', 'พลังงาน', 'พร้อมใช้'];
                chartData.values = categoryKeys.map(key => data.length === 0 ? 0 : data.reduce((sum, item) => sum + (item.scores[key] || 0), 0) / data.length);
                break;
        }
        $('#mainChartTitle').textContent = chartTitle;
        drawMainChart(currentChartType, chartData.labels, chartData.values, 'คะแนนเฉลี่ย');
    }

    function drawMainChart(type, labels, data, label) {
        const ctx = document.getElementById('mainChart')?.getContext('2d');
        if (!ctx) return;
        if (chartInstance) chartInstance.destroy();
        const chartColors = { backgroundColor: 'rgba(22, 163, 74, 0.2)', borderColor: 'rgba(52, 211, 153, 1)', pointBackgroundColor: 'rgba(52, 211, 153, 1)', color: 'rgba(229, 231, 235, 0.8)' };
        if (type === 'pie' || type === 'radar') {
            chartColors.backgroundColor = (type === 'radar') ? 'rgba(52, 211, 153, 0.2)' : ['#34d399', '#3b82f6', '#ec4899', '#f59e0b', '#a855f7'];
            chartColors.borderColor = (type === 'radar') ? 'rgba(52, 211, 153, 1)' : '#111827';
        }
        chartInstance = new Chart(ctx, {
            type, data: { labels, datasets: [{ label, data, ...chartColors, borderWidth: 1.5, tension: 0.1 }] },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartColors.color } } },
                scales: (type === 'bar' || type === 'line') ? { y: { ticks: { color: chartColors.color }, grid: { color: 'rgba(100, 116, 139, 0.2)' } }, x: { ticks: { color: chartColors.color }, grid: { color: 'rgba(100, 116, 139, 0.2)' } } }
                : (type === 'radar' ? { r: { beginAtZero: true, max: 10, ticks: { color: chartColors.color, backdropColor: 'transparent' }, grid: { color: 'rgba(100, 116, 139, 0.2)' }, pointLabels: { color: chartColors.color } } } : {})
            }
        });
    }

    function renderQRCodes() {
        const container = $('#qrCodeContainer');
        if (!container) return;
        const baseUrl = window.location.origin + window.location.pathname;
        container.innerHTML = rooms.map(room => {
            const roomUrl = `${baseUrl}#room=${encodeURIComponent(room.name)}`;
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(roomUrl)}&bgcolor=ffffff&color=000000&qzone=1`;
            return `
                <div class="glass p-4 rounded-xl text-center flex flex-col justify-between">
                    <div>
                        <img src="${qrApiUrl}" alt="QR Code for ${room.name}" class="w-full h-auto mx-auto rounded-lg bg-white p-2">
                        <p class="mt-3 text-emerald-300 font-medium text-lg">${room.name}</p>
                    </div>
                    <button data-room-id="${room.id}" class="print-qr-btn btn w-full mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white">
                        พิมพ์
                    </button>
                </div>
            `;
        }).join('');
    }

    // ในไฟล์ js/main.js

function printSingleQR(roomId) {
    const room = rooms.find(r => r.id == roomId);
    if (!room) return;

    const printArea = document.createElement('div');
    printArea.className = 'printable';
    
    const baseUrl = window.location.origin + window.location.pathname;
    const roomUrl = `${baseUrl}#room=${encodeURIComponent(room.name)}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(roomUrl)}&qzone=2`;

    // --- ส่วนที่แก้ไข ---
    // 1. สร้าง Image object ขึ้นมาใหม่
    const qrImage = new Image();
    
    // 2. ตั้งค่า Cross-Origin เพื่อให้เบราว์เซอร์อนุญาตให้โหลดรูปมาใช้งาน
    qrImage.crossOrigin = "anonymous";
    qrImage.src = qrApiUrl;

    // 3. รอจนกว่ารูปจะโหลดเสร็จสมบูรณ์
    qrImage.onload = () => {
        // 4. เมื่อรูปโหลดเสร็จแล้ว ค่อยสร้าง HTML และสั่งพิมพ์
        printArea.innerHTML = `
            <div style="width: 100%; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: sans-serif; color: black;">
                <h1 style="font-size: 3rem; font-weight: bold; margin: 0;">ห้อง ${room.name}</h1>
                <img src="${qrImage.src}" style="width: 40%; margin: 2rem 0;" alt="QR Code">
                <p style="font-size: 1.25rem;">สแกน QR Code นี้เพื่อเข้าดู Dashboard<br>และผลการประเมินความสะอาดของห้องเรียน</p>
            </div>
        `;
        
        document.body.appendChild(printArea);
        window.print();
        document.body.removeChild(printArea);
    };

    // กรณีที่โหลดรูปไม่สำเร็จ
    qrImage.onerror = () => {
        alert('เกิดข้อผิดพลาดในการโหลดรูป QR Code เพื่อพิมพ์');
    };
}

    function renderRoomList() {
        const container = $('#roomListContainer');
        if (!container) return;
        container.innerHTML = rooms.length === 0 ? '<p class="text-slate-400">ยังไม่มีห้องเรียนในระบบ</p>' : rooms.map(room => `<div class="bg-slate-800 rounded-lg p-2 flex items-center gap-2"><span class="text-emerald-300 font-medium">${room.name}</span><button data-room-id="${room.id}" data-room-name="${room.name}" class="delRoomBtn text-rose-400 hover:text-rose-200 text-xs">(ลบ)</button></div>`).join('');
    }

    function renderRoomOptions(roomList, updateAllFilters = true) {
        const options = roomList.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        const roomSelect = $('#roomSelect');
        if (roomSelect) roomSelect.innerHTML = options || '<option value="">ไม่พบห้อง</option>';
        if (updateAllFilters) {
            const roomFilter = $('#roomFilter');
            if (roomFilter) roomFilter.innerHTML = `<option value="all">ทุกห้อง</option>` + rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        }
    }

    function renderTable(data) {
        const tableBody = $('#tableBody');
        if (!tableBody) return;
        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">ยังไม่มีข้อมูลการประเมิน</td></tr>`;
            return;
        }
        tableBody.innerHTML = data.map(item => `
            <tr class="border-b border-slate-800">
                <td class="py-3 pr-4">${new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td class="py-3 pr-4">${item.room}</td>
                <td class="py-3 pr-4 text-emerald-300 font-medium">${item.total_score}</td>
                <td class="py-3 pr-4 text-slate-300">${item.note || '-'}</td>
                <td class="py-3 pr-4">
                    ${item.photos && item.photos.length > 0 ? `<button data-evaluation-id="${item.id}" class="view-photos-btn text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40">ดู (${item.photos.length})</button>` : `<span class="text-xs text-slate-500">ไม่มีรูป</span>`}
                </td>
                <td class="py-3 pr-4">
                     <button data-id="${item.id}" class="delBtn text-xs px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white">ลบ</button>
                </td>
            </tr>`).join('');
    }

    function openPhotoModal(photos) {
        const modal = $('#photoModal'), container = $('#modalImageContainer');
        if (!modal || !container) return;
        container.innerHTML = photos.map(url => `<a href="${url}" target="_blank" class="block"><img src="${url}" class="w-full h-40 object-cover rounded-lg border-2 border-slate-700 hover:border-emerald-500 transition-colors"></a>`).join('');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closePhotoModal() {
        const modal = $('#photoModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        $('#modalImageContainer').innerHTML = '';
    }
    
    function openRetroactiveModal() {
        const dateInput = $('#retroactiveDate');
        const timeInput = $('#retroactiveTime');
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dateInput.value = now.toISOString().slice(0, 10);
        timeInput.value = now.toISOString().slice(11, 16);
        $('#retroactiveModal').classList.remove('hidden');
        $('#retroactiveModal').classList.add('flex');
    }

    function closeRetroactiveModal() {
        const modal = $('#retroactiveModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
    
    function aggregateDataByTime(data, granularity) {
        if (data.length === 0) return { labels: [], values: [] };
        const getGroupKey = (date) => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            if (granularity === 'daily') return d.toISOString().split('T')[0];
            if (granularity === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            if (granularity === 'weekly') {
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(d.setDate(diff)).toISOString().split('T')[0];
            }
        };
        const groups = data.reduce((acc, item) => {
            const key = getGroupKey(item.created_at);
            if (!acc[key]) acc[key] = [];
            acc[key].push(item.total_score);
            return acc;
        }, {});
        const sortedKeys = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));
        const labels = sortedKeys.map(key => new Date(key).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: (granularity === 'monthly' ? 'numeric' : undefined) }));
        const values = sortedKeys.map(key => groups[key].reduce((a, b) => a + b, 0) / groups[key].length);
        return { labels, values };
    }
    
    function resetForm() {
        $('#roomSelect').selectedIndex = 0;
        ['clean', 'tidy', 'board', 'energy', 'readiness'].forEach(id => {
            const slider = $('#' + id), valueDisplay = $('#' + id + 'Val');
            if(slider) slider.value = 0;
            if(valueDisplay) valueDisplay.textContent = '0';
        });
        $('#noteInput').value = '';
        $('#photoInput').value = '';
        $('#photoPreview').innerHTML = '';
        updateTotalScore();
    }

    function updateTotalScore() {
        const total = ['clean', 'tidy', 'board', 'energy', 'readiness'].reduce((sum, id) => sum + (parseInt($('#' + id)?.value, 10) || 0), 0);
        const totalScoreEl = $('#totalScore');
        if (totalScoreEl) totalScoreEl.textContent = total;
    }
    
    initUI();
    await renderAll();
}