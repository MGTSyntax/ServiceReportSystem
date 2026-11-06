// /app.js

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * STORAGE
   * Talks to the Express + MySQL backend in /server. All requests are
   * relative (e.g. '/api/reports'), so this works whether the frontend
   * is served by that same Express app or by a different static host
   * pointed at the same origin. If you ever need a different origin,
   * change API_BASE below.
   * ---------------------------------------------------------------- */
  const API_BASE = '/api/reports';
  const Store = {
    async getAll() {
      try {
        const res = await fetch(API_BASE);
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not load reports', e);
        alert('Could not load reports from the server. Is the server running?');
        return [];
      }
    },
    async create(report) {
      try {
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not create report', e);
        alert('Could not save the report. Please try again.');
        return null;
      }
    },
    async update(id, report) {
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not update report', e);
        alert('Could not save changes. Please try again.');
        return null;
      }
    },
    async remove(id) {
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return true;
      } catch (e) {
        console.error('Could not delete report', e);
        alert('Could not delete the report. Please try again.');
        return false;
      }
    }
  };

  const PM_API_BASE = '/api/pm-schedule';
  const PMStore = {
    async getAll() {
      try {
        const res = await fetch(PM_API_BASE);
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not load PM schedule', e);
        return [];
      }
    },
    async create(entry) {
      try {
        const res = await fetch(PM_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not create PM schedule entry', e);
        alert('Could not save the PM schedule entry. Please try again.');
        return null;
      }
    },
    async update(id, entry) {
      try {
        const res = await fetch(`${PM_API_BASE}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return await res.json();
      } catch (e) {
        console.error('Could not update PM schedule entry', e);
        alert('Could not save changes. Please try again.');
        return null;
      }
    },
    async remove(id) {
      try {
        const res = await fetch(`${PM_API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Request failed: ' + res.status);
        return true;
      } catch (e) {
        console.error('Could not delete PM schedule entry', e);
        alert('Could not delete the entry. Please try again.');
        return false;
      }
    }
  };

  let reports = [];
  let editingId = null;
  let currentDetailId = null;
  let pmSchedules = [];
  let editingPmId = null;
  let pendingPmSchedule = null;

  const $ = (id) => document.getElementById(id);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  function addMonths(dateStr, months) {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + (months || 3));
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- Navigation ---------------- */
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => { pendingPmSchedule = null; switchView(t.dataset.view); });
  });
  function switchView(view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-' + view).classList.add('active');
    if (view === 'dashboard') renderDashboard();
    if (view === 'pmschedule') renderPmSchedule();
    if (view === 'reports') renderReportsTable();
    if (view === 'newreport' && editingId === null && !pendingPmSchedule) resetForm();
  }

  /* ---------------- Chip groups (single select) ---------------- */
  function setupChipGroup(containerId) {
    const el = $(containerId);
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      [...el.children].forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  }
  ['typeChips', 'serviceTypeChips', 'deptChips', 'assignedChips', 'statusChips', 'pmDeptChips', 'pmAssignedChips'].forEach(setupChipGroup);

  function getSelectedChip(containerId) {
    const sel = $(containerId).querySelector('.chip.selected');
    return sel ? sel.dataset.val : '';
  }
  function setSelectedChip(containerId, val) {
    [...$(containerId).children].forEach(c => c.classList.toggle('selected', c.dataset.val === val));
  }

  function escapeHtml(s) {
    return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  /* ---------------- Detachment dropdown ----------------
   * Populated from every detachment already used in reports or the PM
   * schedule, so the field stays a real dropdown without ever locking
   * out a brand-new site — "+ Add new detachment..." reveals a text box.
   */
  function getKnownDetachments() {
    const map = new Map();
    reports.forEach(r => {
      const v = (r.detachment || '').trim();
      if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
    });
    pmSchedules.forEach(p => {
      const v = (p.detachment || '').trim();
      if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }
  function refreshDetachmentOptions() {
    const list = getKnownDetachments();
    $('f_detachmentSelect').innerHTML =
      `<option value="">Select detachment...</option>` +
      list.map(d => `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('') +
      `<option value="__other__">+ Add new detachment...</option>`;
  }
  function getDetachmentValue() {
    const sel = $('f_detachmentSelect').value;
    return sel === '__other__' ? $('f_detachmentOther').value.trim() : sel;
  }
  function setDetachmentValue(val) {
    refreshDetachmentOptions();
    const v = (val || '').trim();
    const known = [...$('f_detachmentSelect').options].map(o => o.value);
    if (v && known.includes(v)) {
      $('f_detachmentSelect').value = v;
      $('f_detachmentOther').style.display = 'none';
      $('f_detachmentOther').value = '';
    } else if (v) {
      $('f_detachmentSelect').value = '__other__';
      $('f_detachmentOther').style.display = '';
      $('f_detachmentOther').value = v;
    } else {
      $('f_detachmentSelect').value = '';
      $('f_detachmentOther').style.display = 'none';
      $('f_detachmentOther').value = '';
    }
  }
  $('f_detachmentSelect').addEventListener('change', () => {
    if ($('f_detachmentSelect').value === '__other__') {
      $('f_detachmentOther').style.display = '';
      $('f_detachmentOther').focus();
    } else {
      $('f_detachmentOther').style.display = 'none';
      $('f_detachmentOther').value = '';
    }
  });

  /* ---------------- Report number generation ---------------- */
  function nextReportNo() {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = reports.filter(r => (r.reportNo || '').includes('MIB-IT-' + ymd)).length + 1;
    return `MIB-IT-${ymd}-${String(countToday).padStart(3, '0')}`;
  }

  /* ---------------- Form reset / populate ---------------- */
  function resetForm() {
    editingId = null;
    $('formTitle').textContent = 'New Service Report';
    $('f_reportNo').value = nextReportNo();
    $('f_dateReported').value = todayISO();
    ['f_attendedByTop', 'f_reportedThru', 'f_reportedBy',
      'f_problemDetails', 'f_initialFindings', 'f_actionTaken', 'f_remarks',
      'f_assignedOther', 'f_timeIn', 'f_timeOut', 'f_attendedBySignature',
      'f_verifiedBy', 'f_notedBy', 'f_pmEquipment'].forEach(id => $(id).value = '');
    $('f_pmInterval').value = 3;
    $('f_dateAttended').value = '';
    setDetachmentValue('');
    setSelectedChip('typeChips', '');
    setSelectedChip('serviceTypeChips', '');
    setSelectedChip('deptChips', '');
    setSelectedChip('assignedChips', '');
    setSelectedChip('statusChips', 'OP');
    togglePmDetailsRow();
  }

  function togglePmDetailsRow() {
    $('pmDetailsRow').style.display = getSelectedChip('serviceTypeChips') === 'PM' ? '' : 'none';
  }
  $('serviceTypeChips').addEventListener('click', togglePmDetailsRow);

  function populateForm(r) {
    editingId = r.id;
    $('formTitle').textContent = 'Edit Service Report — ' + r.reportNo;
    $('f_reportNo').value = r.reportNo;
    $('f_dateReported').value = r.dateReported || '';
    $('f_attendedByTop').value = r.attendedByTop || '';
    setDetachmentValue(r.detachment || '');
    $('f_reportedThru').value = r.reportedThru || '';
    $('f_reportedBy').value = r.reportedBy || '';
    $('f_problemDetails').value = r.problemDetails || '';
    $('f_initialFindings').value = r.initialFindings || '';
    $('f_actionTaken').value = r.actionTaken || '';
    $('f_remarks').value = r.remarks || '';
    $('f_dateAttended').value = r.dateAttended || '';
    $('f_timeIn').value = r.timeIn || '';
    $('f_timeOut').value = r.timeOut || '';
    $('f_attendedBySignature').value = r.attendedBySignature || '';
    $('f_verifiedBy').value = r.verifiedBy || '';
    $('f_notedBy').value = r.notedBy || '';
    $('f_assignedOther').value = r.assignedOther || '';
    setSelectedChip('typeChips', r.type || '');
    setSelectedChip('serviceTypeChips', r.serviceType || '');
    setSelectedChip('deptChips', r.dept || '');
    setSelectedChip('assignedChips', r.assignedTo || '');
    setSelectedChip('statusChips', r.status || 'OP');
    togglePmDetailsRow();
    if (r.serviceType === 'PM') {
      const match = pmSchedules.find(p => p.detachment.trim().toLowerCase() === (r.detachment || '').trim().toLowerCase());
      $('f_pmEquipment').value = match ? (match.equipment || '') : '';
      $('f_pmInterval').value = match ? (match.intervalMonths || 3) : 3;
    }
  }

  $('cancelFormBtn').addEventListener('click', () => { pendingPmSchedule = null; switchView('dashboard'); });
  $('newFromListBtn').addEventListener('click', () => { pendingPmSchedule = null; resetForm(); switchView('newreport'); });

  $('saveReportBtn').addEventListener('click', async () => {
    if (!$('f_reportedBy').value.trim()) {
      alert('Please enter "Reported By" before saving.');
      $('f_reportedBy').focus();
      return;
    }
    const assignedTo = getSelectedChip('assignedChips') || ($('f_assignedOther').value.trim() ? 'OTHER' : '');
    const data = {
      // id: editingId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      reportNo: $('f_reportNo').value,
      dateReported: $('f_dateReported').value,
      attendedByTop: $('f_attendedByTop').value.trim(),
      detachment: getDetachmentValue(),
      reportedThru: $('f_reportedThru').value.trim(),
      reportedBy: $('f_reportedBy').value.trim(),
      problemDetails: $('f_problemDetails').value.trim(),
      initialFindings: $('f_initialFindings').value.trim(),
      actionTaken: $('f_actionTaken').value.trim(),
      remarks: $('f_remarks').value.trim(),
      type: getSelectedChip('typeChips'),
      serviceType: getSelectedChip('serviceTypeChips'),
      dept: getSelectedChip('deptChips'),
      assignedTo: assignedTo,
      assignedOther: $('f_assignedOther').value.trim(),
      status: getSelectedChip('statusChips') || 'OP',
      dateAttended: $('f_dateAttended').value,
      timeIn: $('f_timeIn').value,
      timeOut: $('f_timeOut').value,
      attendedBySignature: $('f_attendedBySignature').value.trim(),
      verifiedBy: $('f_verifiedBy').value.trim(),
      notedBy: $('f_notedBy').value.trim(),
      archived: editingId ? ((reports.find(r => r.id === editingId) || {}).archived ? 1 : 0) : 0,
      createdAt: editingId ? (reports.find(r => r.id === editingId) || {}).createdAt || new Date().toISOString() : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = editingId ? await Store.update(editingId, data) : await Store.create(data);
    if (!saved) return;
    const wasEditing = !!editingId;
    if (editingId) {
      reports = reports.map(r => r.id === editingId ? saved : r);
    } else {
      reports.push(saved);
    }
    editingId = null;

    if (pendingPmSchedule) {
      const pm = pmSchedules.find(p => p.id === pendingPmSchedule);
      pendingPmSchedule = null;
      let landedEntry = null;
      if (pm) {
        const doneDate = saved.dateAttended || todayISO();
        const updatedPm = { ...pm, lastDone: doneDate, nextDue: addMonths(doneDate, pm.intervalMonths || 3) };
        const savedPm = await PMStore.update(pm.id, updatedPm);
        if (savedPm) {
          pmSchedules = pmSchedules.map(x => x.id === pm.id ? savedPm : x);
          landedEntry = savedPm;
        }
      }
      if (landedEntry) pmSelectedYear = pmYearOf(landedEntry.nextDue);
      switchView('pmschedule');
    } else {
      if (data.serviceType === 'PM' && !wasEditing) {
        const pmEntry = await syncPmScheduleFromReport(saved, {
          equipment: $('f_pmEquipment').value.trim(),
          intervalMonths: parseInt($('f_pmInterval').value, 10) || 3,
        });
        if (pmEntry) pmSelectedYear = pmYearOf(pmEntry.nextDue);
        switchView('pmschedule');
      } else {
        switchView('reports');
      }
    }
  });

  // Auto-links a saved PM-type report to a PM Schedule entry: updates a
  // matching entry (same detachment) or creates one if none exists yet.
  // opts.equipment / opts.intervalMonths come from the New Report form's
  // PM Details fields (only shown when Service Type = PM). Returns the
  // resulting entry so the caller can jump the calendar to its date.
  async function syncPmScheduleFromReport(saved, opts = {}) {
    if (!saved.detachment) return null;
    const doneDate = saved.dateAttended || todayISO();
    const equipment = (opts.equipment || '').trim();
    const match = pmSchedules.find(p =>
      p.detachment.trim().toLowerCase() === saved.detachment.trim().toLowerCase() &&
      (p.equipment || '').trim().toLowerCase() === equipment.toLowerCase()
    );
    if (match) {
      const interval = opts.intervalMonths || match.intervalMonths || 3;
      const updated = {
        ...match,
        dept: saved.dept || match.dept,
        assignedTo: (saved.assignedTo && saved.assignedTo !== 'OTHER') ? saved.assignedTo : match.assignedTo,
        equipment: opts.equipment || match.equipment,
        intervalMonths: interval,
        lastDone: doneDate,
        nextDue: addMonths(doneDate, interval),
      };
      const savedPm = await PMStore.update(match.id, updated);
      if (savedPm) {
        pmSchedules = pmSchedules.map(x => x.id === match.id ? savedPm : x);
        return savedPm;
      }
      return null;
    } else {
      const interval = opts.intervalMonths || 3;
      const newEntry = {
        // id: 'pm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        detachment: saved.detachment,
        dept: saved.dept || '',
        equipment: opts.equipment || '',
        intervalMonths: interval,
        lastDone: doneDate,
        nextDue: addMonths(doneDate, interval),
        assignedTo: (saved.assignedTo && saved.assignedTo !== 'OTHER') ? saved.assignedTo : '',
        notes: 'Auto-created from report ' + saved.reportNo,
      };
      const createdPm = await PMStore.create(newEntry);
      if (createdPm) {
        pmSchedules.push(createdPm);
        return createdPm;
      }
      return null;
    }
  }

  /* ---------------- Summary report (replaces old dashboard) ---------------- */
  const STATUS_LABEL = { OP: 'Open', PEN: 'Pending', CL: 'Closed' };
  const TYPE_LABEL = { HW: 'Hardware', SW: 'Software', OT: 'Other' };
  const DEPT_LABEL = { OPS: 'OPS', HO: 'Head Office', OTH: 'Other' };
  const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const STAFF_NAMES = { RAP: 'Roy Placido', RCA: 'Ron Anacan', MGT: 'Marlon Torres' };

  let selectedYear = null;

  function reportDate(r) {
    const d = r.dateAttended || r.dateReported || r.createdAt;
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt) ? null : dt;
  }
  function reportMonth(r) {
    const d = reportDate(r);
    return d ? d.getMonth() : null;
  }
  function reportYear(r) {
    const d = reportDate(r);
    return d ? d.getFullYear() : null;
  }

  function getAvailableYears() {
    const yrs = new Set();
    reports.forEach(r => {
      if (r.archived) return;
      const y = reportYear(r);
      if (y !== null) yrs.add(y);
    });
    yrs.add(new Date().getFullYear());
    return [...yrs].sort((a, b) => b - a);
  }

  function pct(part, total) {
    if (!total) return '0.00%';
    return (part / total * 100).toFixed(2) + '%';
  }

  function buildBreakdownTable(title, order, counts, labelMap) {
    const total = order.reduce((s, k) => s + (counts[k] || 0), 0);
    const rows = order.map(k => {
      const c = counts[k] || 0;
      return `<tr><td>${escapeHtml(labelMap[k] || k)}</td><td class="num">${c}</td><td class="num">${pct(c, total)}</td></tr>`;
    }).join('');
    return `
      <div class="report-card">
        <div class="card-title">${escapeHtml(title)}</div>
        <table class="report-table">
          <tr><td></td><td></td><td class="num hdr">%</td></tr>
          ${rows}
          <tr class="grandtotal"><td></td><td class="num">${total}</td><td class="num">100.00%</td></tr>
        </table>
      </div>`;
  }

  function buildMonthlyReportCard(monthCounts, quarterSums, total) {
    const QUARTERS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
    const QLABELS = ['Q1', 'Q2', 'Q3', 'Q4'];
    let rows = '';
    QUARTERS.forEach((idxs, qi) => {
      idxs.forEach((mi, j) => {
        rows += `<tr>${j === 0 ? `<td class="qlabel" rowspan="3">${QLABELS[qi]}</td>` : ''}<td>${MONTH_LABEL[mi].toUpperCase()}</td><td class="num">${monthCounts[mi] || 0}</td></tr>`;
      });
      rows += `<tr class="subtotal"><td></td><td class="num">${pct(quarterSums[qi], total)}</td><td class="num">${quarterSums[qi]}</td></tr>`;
    });
    rows += `<tr class="grandtotal"><td>TOT</td><td class="num">100.00%</td><td class="num">${total}</td></tr>`;
    return `
      <div class="report-card">
        <div class="card-title">Monthly Report</div>
        <table class="report-table">${rows}</table>
      </div>`;
  }

  function buildMatrixTable(year, monthCounts, quarterSums, total) {
    const Q = [['JAN', 'FEB', 'MAR'], ['APR', 'MAY', 'JUN'], ['JUL', 'AUG', 'SEP'], ['OCT', 'NOV', 'DEC']];
    const monthHeaderCells = Q.map(g => g.map(m => `<th>${m}</th>`).join('')).join('');
    const quarterHeaderCells = Q.map((g, i) => `<th colspan="3">Q${i + 1}</th>`).join('');
    let concernCells = '';
    for (let mi = 0; mi < 12; mi++) { concernCells += `<td class="num">${monthCounts[mi] || 0}</td>`; }
    const totalCells = Q.map((g, i) => `<td colspan="3" class="num">${quarterSums[i]}</td>`).join('');
    const pctCells = Q.map((g, i) => `<td colspan="3" class="num">${pct(quarterSums[i], total)}</td>`).join('');
    return `
      <div class="report-card matrix-wrap" style="margin-bottom:20px;">
        <table class="report-table matrix-table">
          <tr><th class="yearcell">${year}</th>${quarterHeaderCells}<th rowspan="2">TOTAL</th></tr>
          <tr><th></th>${monthHeaderCells}</tr>
          <tr><td>Reported Concern</td>${concernCells}<td></td></tr>
          <tr class="subtotal"><td>TOTAL</td>${totalCells}<td class="num">${total}</td></tr>
          <tr class="grandtotal"><td>%</td>${pctCells}<td class="num">100.00%</td></tr>
        </table>
      </div>`;
  }
  function buildRecentActivityCard(active) {

    const latest = [...active]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);

    return `
    <div class="report-card activity-card">
        <div class="card-title">Recent Activity</div>

        <div class="activity-list">

        ${latest.length ?

        latest.map(r => `

            <div class="activity-item">

                <div class="activity-title">
    ${new Date(r.updatedAt).toLocaleDateString()} • ${STATUS_LABEL[r.status]}
</div>

<div class="activity-sub">
    ${escapeHtml(r.reportNo)}
</div>

            </div>

            `).join('')

        :

        `<div class="activity-item">
                <div class="activity-sub">No recent activity.</div>
            </div>`

      }

        </div>

    </div>`;
  }

  function renderDashboard() {
    const years = getAvailableYears();
    if (selectedYear === null || !years.includes(selectedYear)) selectedYear = years[0];
    $('yearSelect').innerHTML = years.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');

    const active = reports.filter(r => !r.archived && reportYear(r) === selectedYear);

    const monthCounts = new Array(12).fill(0);
    active.forEach(r => { const m = reportMonth(r); if (m !== null) monthCounts[m]++; });
    const quarterSums = [
      monthCounts[0] + monthCounts[1] + monthCounts[2],
      monthCounts[3] + monthCounts[4] + monthCounts[5],
      monthCounts[6] + monthCounts[7] + monthCounts[8],
      monthCounts[9] + monthCounts[10] + monthCounts[11],
    ];
    const total = quarterSums.reduce((a, b) => a + b, 0);

    const typeCounts = {}, serviceCounts = {}, deptCounts = {}, assignedCounts = {}, statusCounts = {};
    active.forEach(r => {
      if (r.type) typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
      if (r.serviceType) serviceCounts[r.serviceType] = (serviceCounts[r.serviceType] || 0) + 1;
      if (r.dept) deptCounts[r.dept] = (deptCounts[r.dept] || 0) + 1;
      if (r.assignedTo && r.assignedTo !== 'OTHER') assignedCounts[r.assignedTo] = (assignedCounts[r.assignedTo] || 0) + 1;
      if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    $('summaryWrap').innerHTML = `
    ${buildMatrixTable(selectedYear, monthCounts, quarterSums, total)}

     <div class="breakdown-grid">

    ${buildBreakdownTable('Problem Type',
      ['HW', 'SW', 'OT'],
      typeCounts,
      { HW: 'Hardware', SW: 'Software', OT: 'Others' })}

    ${buildBreakdownTable('Assigned To',
        ['RAP', 'MGT', 'RCA'],
        assignedCounts,
        { RAP: 'RAP', MGT: 'MGT', RCA: 'RCA' })}

    ${buildBreakdownTable('Service Type',
          ['PM', 'ISSUANCE', 'REPAIR'],
          serviceCounts,
          { PM: 'Prev. Maint.', ISSUANCE: 'Issuance', REPAIR: 'Repair' })}

    ${buildBreakdownTable('Status',
            ['CL', 'OP', 'PEN'],
            statusCounts,
            { CL: 'Closed', OP: 'Open', PEN: 'Pending' })}

    ${buildBreakdownTable('Department',
              ['OPS', 'HO', 'OTH'],
              deptCounts,
              { OPS: 'OPS', HO: 'HO', OTH: 'OTH' })}

    ${buildRecentActivityCard(active)}

</div>
      </div>
    `;
  }
  $('yearSelect').addEventListener('change', (e) => {
    selectedYear = parseInt(e.target.value, 10);
    renderDashboard();
  });

  /* ---------------- PM Schedule ---------------- */
  let pmSelectedYear = null;

  function pmStatusInfo(nextDue) {
    if (!nextDue) return { key: 'scheduled', label: 'Scheduled' };
    const today = new Date(todayISO());
    const due = new Date(nextDue);
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays <= 14) return { key: 'duesoon', label: 'Due Soon' };
    return { key: 'scheduled', label: 'Scheduled' };
  }

  function pmYearOf(dateVal) {
    const y = parseInt((dateVal || '').toString().slice(0, 4), 10);
    return isNaN(y) ? new Date().getFullYear() : y;
  }

  function pmRow(p) {
    const st = pmStatusInfo(p.nextDue);
    return `
      <tr data-id="${p.id}">
        <td>${escapeHtml(p.detachment)}</td>
        <td>${escapeHtml(p.equipment) || '<span class="muted">—</span>'}</td>
        <td>${DEPT_LABEL[p.dept] || '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(p.assignedTo) || '<span class="muted">—</span>'}</td>
        <td><span class="badge ${st.key}">${st.label}</span></td>
        <td>${p.nextDue}</td>
        <td>
          <div class="pm-row-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="done" data-id="${p.id}">Mark Done</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
          </div>
        </td>
      </tr>`;
  }

  function pmTableWrap(rows) {
    return `
      <table class="pm-table">
        <thead><tr>
          <th>Detachment</th><th>Equipment Covered</th><th>Dept</th><th>Assigned To</th><th>Status</th><th>Target Date</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function getAvailablePmYears() {
    const yrs = new Set();
    pmSchedules.forEach(p => { if (p.nextDue) yrs.add(pmYearOf(p.nextDue)); });
    yrs.add(new Date().getFullYear());
    return [...yrs].sort((a, b) => b - a);
  }

  function renderPmSchedule() {
    const years = getAvailablePmYears();
    if (pmSelectedYear === null || !years.includes(pmSelectedYear)) pmSelectedYear = years[0];
    $('pmYearSelect').innerHTML = years.map(y => `<option value="${y}" ${y === pmSelectedYear ? 'selected' : ''}>${y}</option>`).join('');

    const deptFilter = $('pmDeptFilter').value;
    const matchesDept = p => !deptFilter || p.dept === deptFilter;
    const deptScoped = pmSchedules.filter(matchesDept);

    const dueSoonCount = deptScoped.filter(p => pmStatusInfo(p.nextDue).key === 'duesoon').length;
    $('pmStatGrid').innerHTML = `
      <div class="stat-card"><div class="label">Total Scheduled</div><div class="value">${deptScoped.length}</div><div class="delta">All entries</div></div>
      <div class="stat-card"><div class="label">Due Soon</div><div class="value">${dueSoonCount}</div><div class="delta">Within 14 days</div></div>
    `;

    const yearEntries = deptScoped.filter(p => p.nextDue && pmYearOf(p.nextDue) === pmSelectedYear);

    if (!pmSchedules.length) {
      $('pmScheduleWrap').innerHTML = '<div class="empty-hint">No PM schedule entries yet. They\'re created automatically when you save a New Report with Service Type set to PM.</div>';
    } else if (!yearEntries.length) {
      $('pmScheduleWrap').innerHTML = '<div class="empty-hint">No PM schedule entries for this year / department.</div>';
    } else {
      let html = '';
      for (let mi = 0; mi < 12; mi++) {
        const monthEntries = yearEntries.filter(p => new Date(p.nextDue).getMonth() === mi)
          .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue));
        if (!monthEntries.length) continue;
        html += `
          <div class="pm-month-group">
            <div class="pm-month-head"><span>${MONTH_LABEL[mi].toUpperCase()}</span><span class="count">${monthEntries.length}</span></div>
            ${pmTableWrap(monthEntries.map(pmRow).join(''))}
          </div>`;
      }
      $('pmScheduleWrap').innerHTML = html;
    }

    $('pmScheduleWrap').querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openPmModal(btn.dataset.id));
    });
    $('pmScheduleWrap').querySelectorAll('[data-action="done"]').forEach(btn => {
      btn.addEventListener('click', () => startPmCompletion(btn.dataset.id));
    });

    const assignedCounts = {};
    yearEntries.forEach(p => { if (p.assignedTo) assignedCounts[p.assignedTo] = (assignedCounts[p.assignedTo] || 0) + 1; });
    $('pmSummaryWrap').innerHTML = buildBreakdownTable('Assigned To', ['RAP', 'MGT', 'RCA'], assignedCounts, { RAP: 'RAP', MGT: 'MGT', RCA: 'RCA' });
  }

  $('pmYearSelect').addEventListener('change', (e) => {
    pmSelectedYear = parseInt(e.target.value, 10);
    renderPmSchedule();
  });
  $('pmDeptFilter').addEventListener('change', renderPmSchedule);



  function resetPmForm() {
    editingPmId = null;
    $('pmModalTitle').textContent = 'Add PM Schedule';
    $('pm_detachment').value = '';
    $('pm_equipment').value = '';
    $('pm_interval').value = 3;
    $('pm_nextDue').value = todayISO();
    $('pm_notes').value = '';
    setSelectedChip('pmDeptChips', '');
    setSelectedChip('pmAssignedChips', '');
    $('pmDeleteBtn').style.display = 'none';
  }

  function openPmModal(id) {
    if (id) {
      const p = pmSchedules.find(x => x.id === id);
      if (!p) return;
      editingPmId = id;
      $('pmModalTitle').textContent = 'Edit PM Schedule';
      $('pm_detachment').value = p.detachment || '';
      $('pm_equipment').value = p.equipment || '';
      $('pm_interval').value = p.intervalMonths || 3;
      $('pm_nextDue').value = p.nextDue || '';
      $('pm_notes').value = p.notes || '';
      setSelectedChip('pmDeptChips', p.dept || '');
      setSelectedChip('pmAssignedChips', p.assignedTo || '');
      $('pmDeleteBtn').style.display = '';
    } else {
      resetPmForm();
    }
    $('pmOverlay').classList.add('active');
  }
  function closePmModal() { $('pmOverlay').classList.remove('active'); }

  $('pmModalClose').addEventListener('click', closePmModal);
  $('pmOverlay').addEventListener('click', (e) => { if (e.target.id === 'pmOverlay') closePmModal(); });

  $('pmSaveBtn').addEventListener('click', async () => {
    if (!$('pm_detachment').value.trim()) {
      alert('Please enter a detachment / site name.');
      $('pm_detachment').focus();
      return;
    }
    if (!$('pm_nextDue').value) {
      alert('Please set a Next Due date.');
      $('pm_nextDue').focus();
      return;
    }
    const data = {
      // id: editingPmId || ('pm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      detachment: $('pm_detachment').value.trim(),
      dept: getSelectedChip('pmDeptChips'),
      equipment: $('pm_equipment').value.trim(),
      intervalMonths: parseInt($('pm_interval').value, 10) || 3,
      lastDone: editingPmId ? (pmSchedules.find(p => p.id === editingPmId) || {}).lastDone || '' : '',
      nextDue: $('pm_nextDue').value,
      assignedTo: getSelectedChip('pmAssignedChips'),
      notes: $('pm_notes').value.trim(),
    };
    const saved = editingPmId ? await PMStore.update(editingPmId, data) : await PMStore.create(data);
    if (!saved) return;
    if (editingPmId) {
      pmSchedules = pmSchedules.map(p => p.id === editingPmId ? saved : p);
    } else {
      pmSchedules.push(saved);
    }
    editingPmId = null;
    closePmModal();
    renderPmSchedule();
  });

  $('pmDeleteBtn').addEventListener('click', async () => {
    if (!editingPmId) return;
    if (!confirm('Delete this PM schedule entry? This cannot be undone.')) return;
    const ok = await PMStore.remove(editingPmId);
    if (!ok) return;
    pmSchedules = pmSchedules.filter(p => p.id !== editingPmId);
    editingPmId = null;
    closePmModal();
    renderPmSchedule();
  });

  // "Mark Done" opens a pre-filled New Report; saving it advances the PM's nextDue automatically.
  function startPmCompletion(id) {
    const p = pmSchedules.find(x => x.id === id);
    if (!p) return;
    pendingPmSchedule = id;
    resetForm();
    setDetachmentValue(p.detachment || '');
    setSelectedChip('deptChips', p.dept || '');
    setSelectedChip('assignedChips', p.assignedTo || '');
    setSelectedChip('typeChips', 'HW');
    setSelectedChip('serviceTypeChips', 'PM');
    togglePmDetailsRow();
    $('f_pmEquipment').value = p.equipment || '';
    $('f_pmInterval').value = p.intervalMonths || 3;
    $('f_problemDetails').value = p.equipment ? `Scheduled preventive maintenance — ${p.equipment}` : 'Scheduled preventive maintenance';
    $('f_dateAttended').value = todayISO();
    switchView('newreport');
  }

  /* ---------------- Reports table ---------------- */
  function renderReportsTable() {
    const q = $('searchInput').value.trim().toLowerCase();
    const st = $('filterStatus').value;
    const ty = $('filterType').value;
    const dp = $('filterDept').value;

    let filtered = reports.filter(r => {
      if (!$('showArchived').checked && r.archived) return false;
      if (st && r.status !== st) return false;
      if (ty && r.type !== ty) return false;
      if (dp && r.dept !== dp) return false;
      if (q) {
        const hay = [r.reportNo, r.reportedBy, r.problemDetails, r.detachment, r.attendedByTop].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!filtered.length) {
      $('reportsTableWrap').innerHTML = `<div class="empty-state"><b>No reports found.</b><br>Try adjusting your filters, or create a new report.</div>`;
      return;
    }

    $('reportsTableWrap').innerHTML = `
      <table class="reports">
        <thead><tr>
          <th>Report No.</th><th>Date Attended</th><th>Reported By</th><th>Type</th><th>Assigned To</th><th>Dept</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${filtered.map(r => `
            <tr data-id="${r.id}" class="${r.archived ? 'is-archived' : ''}">
              <td class="rno">${r.reportNo}</td>
              <td>${r.dateAttended || '<span class="muted">—</span>'}</td>
              <td>${escapeHtml(r.reportedBy) || '<span class="muted">—</span>'}</td>
              <td>${TYPE_LABEL[r.type] || '<span class="muted">—</span>'}</td>
              <td>${escapeHtml(r.assignedTo === 'OTHER' ? r.assignedOther : r.assignedTo) || '<span class="muted">—</span>'}</td>
              <td>${DEPT_LABEL[r.dept] || '<span class="muted">—</span>'}</td>
              <td><span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>${r.archived ? ' <span class="badge archived">Archived</span>' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    $('reportsTableWrap').querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', () => openDetail(tr.dataset.id));
    });
  }
  $('searchInput').addEventListener('input', renderReportsTable);
  ['filterStatus', 'filterType', 'filterDept', 'showArchived'].forEach(id => $(id).addEventListener('change', renderReportsTable));

  $('exportCsvBtn').addEventListener('click', () => {
    if (!reports.length) { alert('No reports to export yet.'); return; }
    const cols = ['reportNo', 'dateReported', 'attendedByTop', 'detachment', 'reportedThru', 'reportedBy',
      'problemDetails', 'initialFindings', 'actionTaken', 'remarks',
      'type', 'serviceType', 'dept', 'assignedTo', 'assignedOther', 'status',
      'dateAttended', 'timeIn', 'timeOut', 'attendedBySignature', 'verifiedBy', 'notedBy', 'archived'];
    const csvRows = [cols.join(',')];
    reports.forEach(r => {
      const row = cols.map(c => {
        let v = r[c];
        v = (v === undefined || v === null) ? '' : String(v);
        v = v.replace(/"/g, '""');
        return `"${v}"`;
      });
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mib_it_service_reports.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  /* ---------------- Detail modal ---------------- */
  function openDetail(id) {
    const r = reports.find(x => x.id === id);
    if (!r) return;
    currentDetailId = id;
    $('detailTitle').textContent = r.reportedBy || 'Untitled report';
    $('detailSub').textContent = `${r.reportNo} · Created ${new Date(r.createdAt).toLocaleDateString()}`;
    $('archiveReportBtn').textContent = r.archived ? 'Unarchive report' : 'Archive report';

    const field = (label, val, full) => `<div class="dfield ${full ? 'full' : ''}"><div class="dl">${label}</div><div class="dv">${val && String(val).trim() ? escapeHtml(val) : '—'}</div></div>`;
    const statusField = `<div class="dfield"><div class="dl">Status</div><div class="dv"><span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>${r.archived ? ' <span class="badge archived">Archived</span>' : ''}</div></div>`;

    $('detailBody').innerHTML = `
      <div class="detail-grid">
        ${statusField}
        ${field('Report No.', r.reportNo)}
        ${field('Date Reported', r.dateReported)}
        ${field('Attended By (top)', r.attendedByTop)}
        ${field('Detachment', r.detachment)}
        ${field('Reported Thru', r.reportedThru)}
        ${field('Reported By', r.reportedBy)}
        ${field('Problem Details', r.problemDetails, true)}
        ${field('Initial Findings', r.initialFindings, true)}
        ${field('Action Taken', r.actionTaken, true)}
        ${field('Remarks', r.remarks, true)}
        ${field('Type', TYPE_LABEL[r.type] || r.type)}
        ${field('Service Type', r.serviceType)}
        ${field('Dept', DEPT_LABEL[r.dept] || r.dept)}
        ${field('Assigned To', r.assignedTo === 'OTHER' ? r.assignedOther : r.assignedTo)}
        ${field('Date Attended', r.dateAttended)}
        ${field('Time In / Out', (r.timeIn || '—') + ' – ' + (r.timeOut || '—'))}
        ${field('Attended By (signed)', r.attendedBySignature)}
        ${field('Verified By', r.verifiedBy)}
        ${field('Noted By', r.notedBy)}
      </div>
    `;
    $('detailOverlay').classList.add('active');
  }
  function closeDetail() { $('detailOverlay').classList.remove('active'); currentDetailId = null; }
  $('closeDetail').addEventListener('click', closeDetail);
  $('closeDetailBtn2').addEventListener('click', closeDetail);
  $('detailOverlay').addEventListener('click', (e) => { if (e.target.id === 'detailOverlay') closeDetail(); });

  /* ---------------- Print (paper-form layout) ----------------
   * Only the fields that appear on the physical MIB-IT-RMF-001 form
   * are printed. Classification fields (Type, Service Type, Dept,
   * Assigned To) are for in-system tracking/reporting only and are
   * deliberately left off the printout.
   */
  function box(val) {
    return (val && String(val).trim()) ? escapeHtml(val).replace(/\n/g, '<br>') : '';
  }
  function buildPrintHTML(r) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(r.reportNo)}</title>
<style>
  @page{ size:A4; margin:16mm 15mm; }
  *{ box-sizing:border-box; }
  body{ font-family:Verdana, Geneva, Tahoma, sans-serif; color:#111; font-size:11.5px; line-height:1.45; margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .refno{ text-align:right; font-size:9.5px; color:#666; margin-bottom:2px; }
  .header{ text-align:center; margin-bottom:6px; }
  .header .company{ font-size:16px; font-weight:700; }
  .header .dept{ font-size:11px; letter-spacing:.3px; margin-top:1px; }
  .formtitle{ font-size:13px; font-weight:700; text-transform:uppercase; text-align:left; margin-top:12px; letter-spacing:.5px; }
  .section{ border:1px solid #000; margin-top:8px; }
  .section-head{ background:#000; color:#fff; font-weight:700; font-size:11px; text-transform:uppercase; padding:4px 8px; letter-spacing:.4px; }
  .section-body{ min-height:52px; padding:8px; font-size:12px; letter-spacing:.15px; }
  .meta-grid{ border-top:1px solid #000; }
  .meta-row{ display:flex; border-bottom:1px solid #000; }
  .meta-row:last-child{ border-bottom:none; }
  .meta-cell{ flex:1; border-right:1px solid #000; padding:5px 8px; min-height:26px; }
  .meta-cell:last-child{ border-right:none; }
  .meta-cell .l{ font-weight:700; text-transform:uppercase; font-size:9px; color:#333; display:block; margin-bottom:2px; letter-spacing:.3px; }
  .meta-cell .v{ font-size:12px; letter-spacing:.15px; }
  .bottom-table{ width:100%; border-collapse:collapse; margin-top:10px; border:1px solid #000; font-size:11px; table-layout:fixed; }
  .bottom-table td{ border:1px solid #000; padding:8px; vertical-align:top; width:50%; height:34px; }
  .bottom-table .l{ font-weight:700; text-transform:uppercase; font-size:9px; color:#333; display:block; margin-bottom:3px; letter-spacing:.3px; }
  .bottom-table .v{ font-size:12px; letter-spacing:.15px; }
  .sig-cell{ height:56px; }
  .sig-name{ margin-top:20px; border-top:1px solid #000; padding-top:2px; font-size:10.5px; text-align:center; letter-spacing:.15px; }
  .sig-sub{ font-size:9px; color:#666; text-align:center; text-transform:uppercase; letter-spacing:.3px; }
  .footer{ margin-top:10px; font-size:9px; color:#555; display:flex; justify-content:space-between; }
  @media print{ .noprint{ display:none; } }
</style>
</head>
<body>
  <div class="refno">Ref: ${escapeHtml(r.reportNo)}</div>
  <div class="header">
    <div class="company">MIB Security Services, Inc.</div>
    <div class="dept">INFORMATION TECHNOLOGY DEPARTMENT</div>
  </div>
  <div class="formtitle">Service Report Form</div>

  <div class="section">
    <div class="section-head">A. Problem Details</div>
    <div class="section-body">${box(r.problemDetails)}</div>
    <div class="meta-grid">
      <div class="meta-row">
        <div class="meta-cell"><span class="l">Date Reported</span><span class="v">${box(r.dateReported)}</span></div>
      </div>
      <div class="meta-row">
        <div class="meta-cell"><span class="l">Attended By</span><span class="v">${box(r.attendedByTop)}</span></div>
        <div class="meta-cell"><span class="l">Detachment</span><span class="v">${box(r.detachment)}</span></div>
      </div>
      <div class="meta-row">
        <div class="meta-cell" style="flex:1"><span class="l">Reported By</span><span class="v">${box(r.reportedBy)}</span></div>
        <div class="meta-cell" style="flex:2"><span class="l">Reported Thru</span><span class="v">${box(r.reportedThru)}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head">B. Initial Findings</div>
    <div class="section-body">${box(r.initialFindings)}</div>
  </div>

  <div class="section">
    <div class="section-head">Action Taken</div>
    <div class="section-body">${box(r.actionTaken)}</div>
  </div>

  <div class="section">
    <div class="section-head">D. Remarks</div>
    <div class="section-body">${box(r.remarks)}</div>
  </div>

  <table class="bottom-table">
    <tr>
      <td><span class="l">Status</span><span class="v">${STATUS_LABEL[r.status] || box(r.status)}</span></td>
      <td><span class="l">Verified By</span><span class="v">${box(r.verifiedBy)}</span></td>
    </tr>
    <tr>
      <td><span class="l">Date Attended</span><span class="v">${box(r.dateAttended)}</span></td>
      <td><span class="l">End Time (OUT)</span><span class="v">${box(r.timeOut)}</span></td>
    </tr>
    <tr>
      <td><span class="l">Start Time (IN)</span><span class="v">${box(r.timeIn)}</span></td>
      <td><span class="l">Noted By</span><span class="v">${box(r.notedBy)}</span></td>
    </tr>
    <tr>
      <td class="sig-cell">
        <span class="l">Attended By</span>
        <div class="sig-name">${box(STAFF_NAMES[r.assignedTo] || (r.assignedTo === 'OTHER' ? r.assignedOther : r.attendedBySignature))}</div>
        <div class="sig-sub">Signature over printed name</div>
      </td>
      <td class="sig-cell">
        <div class="sig-name">&nbsp;</div>
        <div class="sig-sub">Department Head</div>
      </td>
    </tr>
  </table>

  <div class="footer">
    <span>MIB-IT-RMF-001</span>
    <span>Please furnish two (2) copies for personal and requestor's copy</span>
  </div>

  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;
  }
  $('printReportBtn').addEventListener('click', () => {
    const r = reports.find(x => x.id === currentDetailId);
    if (!r) return;
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to print this report.'); return; }
    win.document.write(buildPrintHTML(r));
    win.document.close();
  });

  $('archiveReportBtn').addEventListener('click', async () => {
    if (!currentDetailId) return;
    const r = reports.find(x => x.id === currentDetailId);
    if (!r) return;
    const updated = { ...r, archived: r.archived ? 0 : 1 };
    const saved = await Store.update(currentDetailId, updated);
    if (!saved) return;
    reports = reports.map(x => x.id === currentDetailId ? saved : x);
    closeDetail();
    renderReportsTable();
    renderDashboard();
  });

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-ghost';
  editBtn.textContent = 'Edit report';
  editBtn.style.marginRight = 'auto';
  editBtn.addEventListener('click', () => {
    const r = reports.find(x => x.id === currentDetailId);
    if (!r) return;
    closeDetail();
    populateForm(r);
    switchView('newreport');
  });
  document.querySelector('.modal-footer').insertBefore(editBtn, document.getElementById('archiveReportBtn'));

  /* ---------------- Init ---------------- */
  async function init() {
    $('reportsTableWrap').innerHTML = '<div class="empty-hint">Loading…</div>';
    reports = await Store.getAll();
    pmSchedules = await PMStore.getAll();
    resetForm();
    renderDashboard();
    renderReportsTable();
  }
  init();
})();
