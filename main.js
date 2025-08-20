// js/main.js (Final Version)

document.addEventListener('DOMContentLoaded', async () => {
    // 1. ตรวจสอบสิทธิ์การล็อกอินก่อน ถ้าไม่ผ่านจะถูก redirect ไปหน้า login
    const session = await protectPage();
    if (!session) return;

    // 2. ถ้าล็อกอินผ่าน ให้เริ่มการทำงานของแอปพลิเคชัน
    initApp();
});

// =============================================================================
//  MAIN APP CONTROLLER
// =============================================================================
async function initApp() {
    // --- Helper Functions ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    // --- State Variables ---
    let rooms = await fetchRooms();
    let allEvaluationsData = [];
    let chartInstance = null;
    let currentChartType = 'bar';

    // ==========================================================
    // A. UI INITIALIZATION: ตั้งค่าการทำงานของปุ่มและฟอร์มทั้งหมด
    // ==========================================================
    function initUI() {
        renderRoomOptions(rooms);
        
        // -- Event Listener: Tab Switching --
        $$('.tabBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                $$('.tabBtn').forEach(b => b.classList.remove('tab-active'));
                e.currentTarget.classList.add('tab-active');
                $$('main > section').forEach(sec => sec.classList.add('hidden'));
                $(`#tab-${tab}`).classList.remove('hidden');
                if (tab === 'dashboard') renderAll();
                if (tab === 'manage') renderRoomList();
            });
        });

        // -- Event Listener: Score Sliders --
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

        // -- Event Listener: Room Search Input --
        $('#roomSearchInput')?.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(searchTerm));
            renderRoomOptions(filteredRooms, false);
        });

        // -- Event Listener: Chart Type Selector Buttons --
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
        
        // -- Event Listeners: Main Buttons & Filters --
        $('#saveBtn')?.addEventListener('click', saveEvaluation);
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

        // -- Event Listeners using Delegation for Dynamic Content --
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
    }

    // ==========================================================
    // B. DATA FUNCTIONS: คุยกับ Supabase
    // ==========================================================
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
    
    async function saveEvaluation() {
        const saveMsg = $('#saveMsg');
        saveMsg.textContent = 'กำลังบันทึก...';
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

            // Step 1: Insert evaluation text data
            const { data: evalData, error: evalError } = await supabaseClient.from('evaluations').insert([{ room_id: roomId, scores, total_score, note, user_id: user.id }]).select('id').single();
            if (evalError) throw evalError;
            const evaluationId = evalData.id;

            // Step 2: Upload photos and insert their URLs
            if (files.length > 0) {
                const uploadPromises = Array.from(files).map(async (file) => {
                    const filePath = `${user.id}/${evaluationId}/${Date.now()}_${file.name}`;
                    const { error: uploadError } = await supabaseClient.storage.from('evaluation-photos').upload(filePath, file);
                    if (uploadError) {
                        // Important: throw error to stop the process if an upload fails
                        throw uploadError;
                    }
                    const { data } = supabaseClient.storage.from('evaluation-photos').getPublicUrl(filePath);
                    return { evaluation_id: evaluationId, photo_url: data.publicUrl };
                });
                const photoInsertData = await Promise.all(uploadPromises);
                
                const { error: photoDbError } = await supabaseClient.from('evaluation_photos').insert(photoInsertData);
                if (photoDbError) throw photoDbError;
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

    // ==========================================================
    // C. RENDER FUNCTIONS: วาดข้อมูลลงบนหน้าจอ
    // ==========================================================
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
        } else {
            kpiBest.textContent = 'N/A';
        }
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
            const fromVal = $('#summaryDateFrom').value;
            const toVal = $('#summaryDateTo').value;
            startDate = fromVal ? new Date(fromVal) : new Date('1970-01-01');
            endDate = toVal ? new Date(toVal) : new Date();
            endDate.setHours(23, 59, 59, 999);
        }

        const filteredData = allData.filter(item => {
            const itemDate = new Date(item.created_at);
            return itemDate >= startDate && itemDate <= endDate;
        });

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
            const best = roomAverages[0];
            const worst = roomAverages[roomAverages.length - 1];
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
                const categoryText = $('#barCategory')?.options[$('#barCategory').selectedIndex].text || 'คะแนนรวมเฉลี่ย';
                chartTitle = `เปรียบเทียบ: ${categoryText}`;
                const scoresByRoom = allData.reduce((acc, item) => {
                    if (!acc[item.room]) acc[item.room] = [];
                    const score = (category === 'total_score') ? item.total_score : (item.scores[category] || 0);
                    acc[item.room].push(score);
                    return acc;
                }, {});
                chartData.labels = Object.keys(scoresByRoom).sort();
                chartData.values = chartData.labels.map(room => {
                    const scores = scoresByRoom[room];
                    return scores.reduce((s, c) => s + c, 0) / scores.length;
                });
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
                chartData.values = categoryKeys.map(key => {
                    if (data.length === 0) return 0;
                    return data.reduce((sum, item) => sum + (item.scores[key] || 0), 0) / data.length;
                });
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

    function renderRoomList() {
        const container = $('#roomListContainer');
        if (!container) return;
        container.innerHTML = rooms.length === 0 ? '<p class="text-slate-400">ยังไม่มีห้องเรียนในระบบ</p>' : rooms.map(room => `
            <div class="bg-slate-800 rounded-lg p-2 flex items-center gap-2">
                <span class="text-emerald-300 font-medium">${room.name}</span>
                <button data-room-id="${room.id}" data-room-name="${room.name}" class="delRoomBtn text-rose-400 hover:text-rose-200 text-xs">(ลบ)</button>
            </div>`).join('');
    }

    function renderRoomOptions(roomList, updateAllFilters = true) {
        const options = roomList.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        const roomSelect = $('#roomSelect');
        if (roomSelect) roomSelect.innerHTML = options || '<option value="">ไม่พบห้อง</option>';
        if (updateAllFilters) {
            const roomFilter = $('#roomFilter');
            if (roomFilter) {
                roomFilter.innerHTML = `<option value="all">ทุกห้อง</option>` + rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            }
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

    // ==========================================================
    // D. HELPER FUNCTIONS & MODAL
    // ==========================================================
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

    // ==========================================================
    // E. APP START: เริ่มการทำงานของแอป
    // ==========================================================
    initUI();
    await renderAll();
}