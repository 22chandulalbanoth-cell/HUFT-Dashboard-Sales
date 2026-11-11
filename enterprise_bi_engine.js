/**
 * HUFT Enterprise Business Intelligence Data & Tab Engine
 * Design D Standard: Enterprise BI
 */

(function () {
  console.log('[Enterprise BI Engine] Initializing...');

  function formatInr(val) {
    val = Number(val) || 0;
    if (Math.abs(val) >= 10000000) return '₹' + (val / 10000000).toFixed(2) + 'Cr';
    if (Math.abs(val) >= 100000) return '₹' + (val / 100000).toFixed(2) + 'L';
    if (Math.abs(val) >= 1000) return '₹' + (val / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  function formatFullInr(val) {
    val = Number(val) || 0;
    return '₹' + Math.round(val).toLocaleString('en-IN');
  }

  function getActiveDates() {
    const F = document.getElementById('from')?.value || '';
    const T = document.getElementById('to')?.value || '';
    const rowList = (Array.isArray(window.rows) && window.rows.length) ? window.rows : (Array.isArray(window.allStoreRows) ? window.allStoreRows : []);
    if (rowList.length) {
      const keys = [...new Set(rowList.filter(r => r && r._key).map(r => String(r._key).slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!F || d >= F) && (!T || d <= T)))].sort();
      if (keys.length) return keys;
    }
    if (F && T && F.length === 10 && T.length === 10) {
      const dates = [];
      let cur = new Date(F + 'T12:00:00');
      const end = new Date(T + 'T12:00:00');
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const day = String(cur.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }
    return [];
  }

  function getActiveRows() {
    if (!Array.isArray(window.rows)) return [];
    const F = document.getElementById('from')?.value || '';
    const T = document.getElementById('to')?.value || '';
    return window.rows.filter(r => {
      const k = typeof r._key === 'string' ? r._key : (r._date instanceof Date ? r._date.toISOString().slice(0, 10) : '');
      if (!k) return true;
      return (!F || k >= F) && (!T || k <= T);
    });
  }

  function getStoreTargets() {
    try {
      const saved = localStorage.getItem('huft_bi_settings_targets');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      weekdayRetail: 28600,
      weekendRetail: 46700,
      weekdaySpa: 16400,
      weekendSpa: 26700
    };
  }

  // 1. Tab 1: Store Performance & Tab 1 Extra KPIs
  window.refreshStorePerformance = function () {
    const dates = getActiveDates();
    if (!dates.length) return;

    const targets = getStoreTargets();
    const pkgSales = typeof window.packageSaleRows === 'function' ? window.packageSaleRows() : [];

    let totRetSales = 0;
    let totSpaSales = 0;
    let totPkgSales = 0;
    let totSales = 0;
    let totTarget = 0;
    let totPets = 0;

    dates.forEach(d => {
      const dayData = typeof window.calcDay === 'function' ? window.calcDay(d) : { retail: 0, spa: 0, total: 0 };
      totRetSales += dayData ? (dayData.retail || 0) : 0;
      totSpaSales += dayData ? (dayData.spa || 0) : 0;
      totSales += dayData ? (dayData.total || 0) : 0;

      const dayPets = typeof window.petCountForDay === 'function' ? (Number(window.petCountForDay(d)) || 0) : 0;
      totPets += dayPets;

      const dt = new Date(d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const retTgt = isWeekend ? targets.weekendRetail : targets.weekdayRetail;
      const spaTgt = isWeekend ? targets.weekendSpa : targets.weekdaySpa;
      totTarget += (retTgt + spaTgt);
    });

    pkgSales.forEach(r => {
      const k = typeof r._key === 'string' ? r._key : (r._date instanceof Date ? r._date.toISOString().slice(0, 10) : String(r.Date || ''));
      if (dates.includes(k.slice(0, 10))) {
        totPkgSales += (typeof window.packageSaleValue === 'function' ? window.packageSaleValue(r) : (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? 0) || 0));
      }
    });

    const ach = totTarget > 0 ? (totSales / totTarget) * 100 : 0;

    // Update Tab 1 Pet Count & Target Achievement KPI Cards
    const elPets = document.getElementById('kPets');
    if (elPets) elPets.textContent = totPets.toLocaleString('en-IN');

    const elAch = document.getElementById('kAchievement');
    if (elAch) elAch.textContent = ach.toFixed(1) + '%';
    const elAchSub = document.getElementById('kAchievementSub');
    if (elAchSub) {
      if (ach >= 100) elAchSub.textContent = 'Target Achieved (' + formatInr(totSales) + ' / ' + formatInr(totTarget) + ')';
      else elAchSub.textContent = 'Pace: ' + formatInr(totSales) + ' of ' + formatInr(totTarget);
    }

    // Populate Store Performance Table (#biStorePerfBody)
    const elBody = document.getElementById('biStorePerfBody');
    if (elBody) {
      let badgeCls = 'bi-badge-neutral';
      let badgeText = 'Pending';
      if (ach >= 110) { badgeCls = 'bi-badge-success'; badgeText = 'Super Target'; }
      else if (ach >= 100) { badgeCls = 'bi-badge-success'; badgeText = 'Target Achieved'; }
      else if (ach >= 80) { badgeCls = 'bi-badge-warning'; badgeText = 'Near Target'; }
      else { badgeCls = 'bi-badge-danger'; badgeText = 'Below Target'; }

      elBody.innerHTML = `<tr>
        <td style="font-weight: 600; text-align: left;">Hyderguda</td>
        <td style="text-align: right;">${formatFullInr(totRetSales)}</td>
        <td style="text-align: right;">${formatFullInr(totSpaSales)}</td>
        <td style="text-align: right;">${formatFullInr(totPkgSales)}</td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totSales)}</td>
        <td style="text-align: right;">${formatFullInr(totTarget)}</td>
        <td style="text-align: right; font-weight: 600;"><span class="bi-badge ${badgeCls}">${ach.toFixed(1)}% (${badgeText})</span></td>
      </tr>`;
    }
  };

  // 2. Tab 2: Sales Analysis (Synchronized 100% with Tab 1)
  window.refreshSalesAnalysis = function () {
    const dates = getActiveDates();
    if (!dates.length) return;

    const targets = getStoreTargets();
    const pkgSales = typeof window.packageSaleRows === 'function' ? window.packageSaleRows() : [];

    let totRetSales = 0;
    let totSpaSales = 0;
    let totFoodSales = 0;
    let totPkgSales = 0;
    let totSales = 0;
    let totRetTarget = 0;
    let totSpaTarget = 0;
    let totTarget = 0;
    const tableRows = [];

    // Distinct bill count across dates matching refreshDashboard
    const scopedRows = dates.flatMap(d => typeof window.dashboardRowsForDay === 'function' ? window.dashboardRowsForDay(d) : []);
    const billRows = scopedRows.filter(r => typeof window.validLineRow === 'function' ? window.validLineRow(r) : true);
    const orderRefs = new Set();
    billRows.forEach((r, i) => {
      const isReturn = typeof window.isReturnBill === 'function' && window.isReturnBill(r);
      const ref = isReturn && typeof window.billKey === 'function' ? window.billKey(r) : (typeof window.salesOrderKey === 'function' ? window.salesOrderKey(r, i) : null);
      if (ref && !/^ROW-\d+$/.test(ref)) {
        if (!isReturn) orderRefs.add(ref);
      } else if (typeof window.salesOrderFallbackKey === 'function') {
        const fallback = window.salesOrderFallbackKey(r, isReturn);
        if (fallback && !isReturn) orderRefs.add(fallback);
      }
    });
    const totalBills = orderRefs.size || (scopedRows.length ? new Set(scopedRows.map(r => r['Invoice/Display Name'] || r['Order Ref'] || r['Column F'])).size : 0);

    dates.forEach(d => {
      const dayData = typeof window.calcDay === 'function' ? window.calcDay(d) : { retail: 0, spa: 0, total: 0, foodTotal: 0 };
      const retAct = dayData ? (dayData.retail || 0) : 0;
      const spaAct = dayData ? (dayData.spa || 0) : 0;
      const foodAct = dayData ? (dayData.foodTotal || 0) : 0;
      const dayTotal = dayData ? (dayData.total || 0) : 0;

      const dayPkgRows = pkgSales.filter(r => {
        const k = typeof r._key === 'string' ? r._key : (r._date instanceof Date ? r._date.toISOString().slice(0, 10) : String(r.Date || ''));
        return k.slice(0, 10) === d;
      });
      const pkgAct = dayPkgRows.reduce((a, r) => a + (typeof window.packageSaleValue === 'function' ? window.packageSaleValue(r) : (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? 0) || 0)), 0);

      const dt = new Date(d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const retTgt = isWeekend ? targets.weekendRetail : targets.weekdayRetail;
      const spaTgt = isWeekend ? targets.weekendSpa : targets.weekdaySpa;
      const dayTgt = retTgt + spaTgt;

      totRetSales += retAct;
      totSpaSales += spaAct;
      totFoodSales += foodAct;
      totPkgSales += pkgAct;
      totSales += dayTotal;
      totRetTarget += retTgt;
      totSpaTarget += spaTgt;
      totTarget += dayTgt;

      const ach = dayTgt > 0 ? (dayTotal / dayTgt) * 100 : 0;
      let badgeCls = 'bi-badge-neutral';
      let badgeText = 'Pending';
      if (ach >= 110) { badgeCls = 'bi-badge-success'; badgeText = 'Super Target'; }
      else if (ach >= 100) { badgeCls = 'bi-badge-success'; badgeText = 'Target Achieved'; }
      else if (ach >= 80) { badgeCls = 'bi-badge-warning'; badgeText = 'Near Target'; }
      else { badgeCls = 'bi-badge-danger'; badgeText = 'Below Target'; }

      tableRows.push(`<tr>
        <td style="font-weight: 500;">${d}</td>
        <td style="text-align: right;">${formatFullInr(retAct)}</td>
        <td style="text-align: right;">${formatFullInr(spaAct)}</td>
        <td style="text-align: right;">${formatFullInr(foodAct)}</td>
        <td style="text-align: right;">${formatFullInr(pkgAct)}</td>
        <td style="text-align: right; font-weight: 600;">${formatFullInr(dayTotal)}</td>
        <td style="text-align: right;">${formatFullInr(dayTgt)}</td>
        <td style="text-align: right; font-weight: 600;">${ach.toFixed(1)}%</td>
        <td><span class="bi-badge ${badgeCls}">${badgeText}</span></td>
      </tr>`);
    });

    const overallAch = totTarget > 0 ? (totSales / totTarget) * 100 : 0;
    const avgBill = totalBills > 0 ? Math.round(totSales / totalBills) : 0;

    // Set 8 KPI cards in Tab 2
    const elTotSales = document.getElementById('biSalesTotSales');
    const elRetSales = document.getElementById('biSalesRetSales');
    const elSpaSales = document.getElementById('biSalesSpaSales');
    const elRetTarget = document.getElementById('biSalesRetTarget');
    const elSpaTarget = document.getElementById('biSalesSpaTarget');
    const elTotBills = document.getElementById('biSalesTotBills');
    const elAtv = document.getElementById('biSalesAtv');
    const elAch = document.getElementById('biSalesAch');

    if (elTotSales) elTotSales.textContent = formatInr(totSales);
    if (elRetSales) elRetSales.textContent = formatInr(totRetSales);
    if (elSpaSales) elSpaSales.textContent = formatInr(totSpaSales);
    if (elRetTarget) elRetTarget.textContent = formatInr(totRetTarget);
    if (elSpaTarget) elSpaTarget.textContent = formatInr(totSpaTarget);
    if (elTotBills) elTotBills.textContent = totalBills.toLocaleString('en-IN');
    if (elAtv) elAtv.textContent = formatFullInr(avgBill);
    if (elAch) elAch.textContent = overallAch.toFixed(1) + '%';

    // Table Body
    const elBody = document.getElementById('biSalesAnalysisBody');
    if (elBody) elBody.innerHTML = tableRows.join('');

    // Table Foot
    const elFoot = document.getElementById('biSalesAnalysisFoot');
    if (elFoot) {
      let totBadge = 'bi-badge-neutral';
      let totText = 'Pending';
      if (overallAch >= 110) { totBadge = 'bi-badge-success'; totText = 'Super Target'; }
      else if (overallAch >= 100) { totBadge = 'bi-badge-success'; totText = 'Target Achieved'; }
      else if (overallAch >= 80) { totBadge = 'bi-badge-warning'; totText = 'Near Target'; }
      else { totBadge = 'bi-badge-danger'; totText = 'Below Target'; }

      elFoot.innerHTML = `<tr>
        <td><strong>TOTAL (${dates.length} Days)</strong></td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totRetSales)}</td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totSpaSales)}</td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totFoodSales)}</td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totPkgSales)}</td>
        <td style="text-align: right; font-weight: 800; color: #0D9488;">${formatFullInr(totSales)}</td>
        <td style="text-align: right; font-weight: 700;">${formatFullInr(totTarget)}</td>
        <td style="text-align: right; font-weight: 700;">${overallAch.toFixed(1)}%</td>
        <td><span class="bi-badge ${totBadge}">${totText}</span></td>
      </tr>`;
    }
  };

  // 3. Tab 3: SPA Analysis Tab
  window.refreshSpaAnalysis = function () {
    const dates = getActiveDates();
    if (!dates.length) return;

    let totSpaSales = 0;
    let totSpaBills = 0;
    const totSpaCustomers = new Set();
    let totPets = 0;
    let totSpaTarget = 0;
    const targets = getStoreTargets();
    const tableRows = [];

    dates.forEach(d => {
      const dayData = typeof window.calcDay === 'function' ? window.calcDay(d) : { spa: 0 };
      const spaSales = dayData ? (dayData.spa || 0) : 0;
      totSpaSales += spaSales;

      const dayPets = typeof window.petCountForDay === 'function' ? (Number(window.petCountForDay(d)) || 0) : 0;
      totPets += dayPets;

      const dayRows = getActiveRows().filter(r => (typeof r._key === 'string' ? r._key : '').slice(0, 10) === d);
      const billsSet = new Set();
      dayRows.forEach(r => {
        const cat = String(r['Order Lines/Product/Product Category'] || r.Category || '').toLowerCase();
        if (cat.includes('spa')) {
          const inv = String(r['Invoice/Display Name'] || r['Order Ref'] || r['Column F'] || '').trim();
          if (inv) billsSet.add(inv);
          const cust = String(r['Customer/Phone'] || r['Customer Phone'] || r.Customer || '').trim();
          if (cust) totSpaCustomers.add(cust);
        }
      });
      const dayBills = billsSet.size;
      totSpaBills += dayBills;

      const dt = new Date(d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const dayTarget = isWeekend ? targets.weekendSpa : targets.weekdaySpa;
      totSpaTarget += dayTarget;

      const ach = dayTarget > 0 ? (spaSales / dayTarget) * 100 : 0;
      let badgeCls = 'bi-badge-neutral';
      let badgeText = 'Pending';
      if (ach >= 110) { badgeCls = 'bi-badge-success'; badgeText = 'Super Target'; }
      else if (ach >= 100) { badgeCls = 'bi-badge-success'; badgeText = 'Target Achieved'; }
      else if (ach >= 80) { badgeCls = 'bi-badge-warning'; badgeText = 'Near Target'; }
      else { badgeCls = 'bi-badge-danger'; badgeText = 'Below Target'; }

      tableRows.push(`<tr>
        <td>${d}</td>
        <td>Hyderguda</td>
        <td>${dayBills}</td>
        <td class="text-right">${formatFullInr(spaSales)}</td>
        <td>${dayPets}</td>
        <td class="text-right">${formatFullInr(dayTarget)}</td>
        <td>${ach.toFixed(1)}%</td>
        <td><span class="bi-badge ${badgeCls}">${badgeText}</span></td>
      </tr>`);
    });

    const overallAch = totSpaTarget > 0 ? (totSpaSales / totSpaTarget) * 100 : 0;
    const avgBill = totSpaBills > 0 ? Math.round(totSpaSales / totSpaBills) : 0;

    const elSales = document.getElementById('biSpaSales');
    const elBills = document.getElementById('biSpaBills');
    const elCust = document.getElementById('biSpaCustomers');
    const elTarget = document.getElementById('biSpaTarget');
    const elAch = document.getElementById('biSpaAch');
    const elPets = document.getElementById('biSpaPets');
    const elAtv = document.getElementById('biSpaAtv');
    const elBody = document.getElementById('biSpaTableBody');

    if (elSales) elSales.textContent = formatInr(totSpaSales);
    if (elBills) elBills.textContent = totSpaBills.toLocaleString('en-IN');
    if (elCust) elCust.textContent = totSpaCustomers.size.toLocaleString('en-IN');
    if (elTarget) elTarget.textContent = formatInr(totSpaTarget);
    if (elAch) elAch.textContent = overallAch.toFixed(1) + '%';
    if (elPets) elPets.textContent = totPets.toLocaleString('en-IN');
    if (elAtv) elAtv.textContent = formatFullInr(avgBill);
    if (elBody) elBody.innerHTML = tableRows.join('');
  };

  // 4. Tab 4: Package Analysis Tab
  window.refreshPackageAnalysis = function () {
    const pkgSales = typeof window.packageSaleRows === 'function' ? window.packageSaleRows() : [];
    const pkgReturns = typeof window.packageReturnRows === 'function' ? window.packageReturnRows() : [];

    const totalSalesVal = pkgSales.reduce((a, r) => a + (typeof window.packageSaleValue === 'function' ? window.packageSaleValue(r) : (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? 0) || 0)), 0);
    const totalQty = pkgSales.reduce((a, r) => a + (typeof window.packageSaleQuantity === 'function' ? window.packageSaleQuantity(r) : 1), 0);
    const returnVal = pkgReturns.reduce((a, r) => a + (typeof window.packageReturnTotalValue === 'function' ? window.packageReturnTotalValue(r) : 0), 0);

    let totalRedeemed = 0;
    let redemptionBillsCount = 0;
    const dates = getActiveDates();
    dates.forEach(d => {
      const redRows = typeof window.packageRedemptionRowsForDay === 'function' ? window.packageRedemptionRowsForDay(d) : [];
      redRows.forEach(r => {
        totalRedeemed += typeof window.spaPackagesUsed === 'function' ? (window.spaPackagesUsed(r) || 1) : 1;
      });
      redemptionBillsCount += redRows.length;
    });

    const uniqueCustomers = new Set(pkgSales.map(r => typeof window.customerKey === 'function' ? window.customerKey(r) : String(r['Customer/Phone'] || r.Customer || '')).filter(Boolean)).size;

    const elSales = document.getElementById('biPkgSales');
    const elQty = document.getElementById('biPkgQty');
    const elCust = document.getElementById('biPkgCustomers');
    const elRedeemed = document.getElementById('biPkgRedeemed');
    const elRedBills = document.getElementById('biPkgRedemptionBills');
    const elRetVal = document.getElementById('biPkgReturns');
    const elNet = document.getElementById('biPkgNet');

    if (elSales) elSales.textContent = formatInr(totalSalesVal);
    if (elQty) elQty.textContent = totalQty.toLocaleString('en-IN');
    if (elCust) elCust.textContent = uniqueCustomers.toLocaleString('en-IN');
    if (elRedeemed) elRedeemed.textContent = totalRedeemed.toLocaleString('en-IN');
    if (elRedBills) elRedBills.textContent = redemptionBillsCount.toLocaleString('en-IN');
    if (elRetVal) elRetVal.textContent = formatInr(returnVal);
    if (elNet) elNet.textContent = formatInr(totalSalesVal - returnVal);

    const salesTableBody = document.getElementById('biPkgSalesTableBody');
    if (salesTableBody) {
      salesTableBody.innerHTML = pkgSales.slice(0, 50).map(r => {
        const inv = String(r['Invoice/Display Name'] || r['Order Ref'] || r['Column F'] || '-');
        const dt = String(r._key || r.Date || '-').slice(0, 10);
        const emp = String(r['Created by'] || r['User'] || 'Store Staff');
        const amt = typeof window.packageSaleValue === 'function' ? window.packageSaleValue(r) : (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? 0) || 0);
        const q = typeof window.packageSaleQuantity === 'function' ? window.packageSaleQuantity(r) : 1;
        return `<tr>
          <td><strong>${inv}</strong></td>
          <td>${dt}</td>
          <td>Hyderguda</td>
          <td>${emp}</td>
          <td class="text-right">${formatFullInr(amt)}</td>
          <td class="text-right">${q}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No package sales found in selected period.</td></tr>';
    }

    const redTableBody = document.getElementById('biPkgRedemptionTableBody');
    if (redTableBody) {
      const redRowsAll = [];
      dates.forEach(d => {
        const rows = typeof window.packageRedemptionRowsForDay === 'function' ? window.packageRedemptionRowsForDay(d) : [];
        rows.forEach(r => redRowsAll.push({ r, d }));
      });
      redTableBody.innerHTML = redRowsAll.slice(0, 50).map(item => {
        const inv = String(item.r['Invoice/Display Name'] || item.r['Order Ref'] || '-');
        const dt = item.d;
        const discount = String(item.r['Order Lines/Discount (%)'] || item.r['Discount'] || '100%');
        const method = String(item.r['Payment Method'] || 'Package Redeem');
        const sess = typeof window.spaPackagesUsed === 'function' ? (window.spaPackagesUsed(item.r) || 1) : 1;
        return `<tr>
          <td><strong>${inv}</strong></td>
          <td>${dt}</td>
          <td>Hyderguda</td>
          <td>${discount}</td>
          <td>${method}</td>
          <td class="text-right">${sess}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No package redemptions found in selected period.</td></tr>';
    }

    const retTableBody = document.getElementById('biPkgReturnsTableBody');
    if (retTableBody) {
      retTableBody.innerHTML = pkgReturns.slice(0, 50).map(r => {
        const inv = String(r['Invoice/Display Name'] || r['Order Ref'] || '-');
        const origInv = String(r['Original Invoice'] || r['Order Ref'] || '-');
        const dt = String(r._key || r.Date || '-').slice(0, 10);
        const amt = typeof window.packageReturnTotalValue === 'function' ? window.packageReturnTotalValue(r) : 0;
        const q = 1;
        return `<tr>
          <td><strong>${inv}</strong></td>
          <td>${origInv}</td>
          <td>${dt}</td>
          <td>Hyderguda</td>
          <td class="text-right">${formatFullInr(amt)}</td>
          <td class="text-right">${q}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No package returns found in selected period.</td></tr>';
    }
  };

  // 5. Tab 5: Brand Analysis Tab
  window.refreshBrandAnalysis = function () {
    const list = getActiveRows();
    const brands = [
      ["Sara's", ["sara's wholesome", "sara’s wholesome", "saras wholesome", "sara"]],
      ["Hearty", ["hearty"]],
      ["Meowsi", ["meowsi"]],
      ["NutriMeow", ["nutri-meow", "nutrimeow", "nutri meow"]],
      ["NutriWag", ["nutriwag", "nutri-wag", "nutri wag"]]
    ];

    let totalBrandSales = 0;
    let totalBrandQty = 0;
    let totalBrandBills = 0;
    const brandData = [];

    brands.forEach(b => {
      const bRows = list.filter(r => {
        const prod = String(r['Order Lines/Product/Name'] || r['Product Name'] || r['Name'] || r['Column J'] || '').toLowerCase();
        return b[1].some(alias => prod.includes(alias));
      });
      const amt = bRows.reduce((a, r) => a + (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? r['Column O'] ?? 0) || 0), 0);
      const q = bRows.reduce((a, r) => a + (Number(r['Order Lines/Quantity'] ?? r['Quantity'] ?? r['Column N'] ?? 1) || 0), 0);
      totalBrandSales += amt;
      totalBrandQty += q;
      totalBrandBills += bRows.length;
      brandData.push({ name: b[0], sales: amt, qty: q, bills: bRows.length });
    });

    const elSales = document.getElementById('biBrandTotalSales');
    const elQty = document.getElementById('biBrandTotalQty');
    const elBills = document.getElementById('biBrandTotalBills');
    const elTop = document.getElementById('biBrandTopName');
    const elShare = document.getElementById('biBrandContribPct');
    const elBody = document.getElementById('biBrandTableBody');

    const topBrand = brandData.slice().sort((a, b) => b.sales - a.sales)[0] || { name: "Sara's" };
    const totalStoreSales = list.reduce((a, r) => a + (Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? 0) || 0), 0);
    const overallShare = totalStoreSales > 0 ? (totalBrandSales / totalStoreSales) * 100 : 0;

    if (elSales) elSales.textContent = formatInr(totalBrandSales);
    if (elQty) elQty.textContent = Math.round(totalBrandQty).toLocaleString('en-IN');
    if (elBills) elBills.textContent = totalBrandBills.toLocaleString('en-IN');
    if (elTop) elTop.textContent = topBrand.name;
    if (elShare) elShare.textContent = overallShare.toFixed(1) + '%';

    if (elBody) {
      elBody.innerHTML = brandData.map(b => {
        const share = totalBrandSales > 0 ? (b.sales / totalBrandSales) * 100 : 0;
        return `<tr>
          <td><strong>${b.name}</strong></td>
          <td class="text-right">${formatFullInr(b.sales)}</td>
          <td class="text-right">${Math.round(b.qty).toLocaleString('en-IN')}</td>
          <td class="text-right">${b.bills.toLocaleString('en-IN')}</td>
          <td class="text-right">${share.toFixed(1)}%</td>
        </tr>`;
      }).join('');
    }
  };

  // 6. Tab 7: Customer Analysis Tab
  window.refreshCustomerAnalysis = function () {
    const list = getActiveRows();
    const customerMap = new Map();

    list.forEach(r => {
      const custId = String(r['Customer/Phone'] || r['Customer Phone'] || r['Phone'] || r['Customer'] || '').trim();
      if (!custId) return;
      const amt = Number(r['Order Lines/Subtotal'] ?? r['Subtotal'] ?? r['Column O'] ?? 0) || 0;
      const q = Number(r['Order Lines/Quantity'] ?? r['Quantity'] ?? r['Column N'] ?? 1) || 1;
      const item = customerMap.get(custId) || { spend: 0, bills: 0, qty: 0 };
      item.spend += amt;
      item.bills += 1;
      item.qty += q;
      customerMap.set(custId, item);
    });

    const totalCustomers = customerMap.size;
    let returningCount = 0;
    let totalSpend = 0;
    let totalCustomerBills = 0;
    const sortedCusts = [];

    customerMap.forEach((v, k) => {
      if (v.bills > 1) returningCount++;
      totalSpend += v.spend;
      totalCustomerBills += v.bills;
      sortedCusts.push({ id: k, ...v });
    });

    const newCustCount = totalCustomers - returningCount;
    const repeatRate = totalCustomers > 0 ? (returningCount / totalCustomers) * 100 : 0;
    const avgCustSpend = totalCustomers > 0 ? Math.round(totalSpend / totalCustomers) : 0;

    const elTot = document.getElementById('biCustTotal');
    const elNew = document.getElementById('biCustNew');
    const elRet = document.getElementById('biCustReturning');
    const elBills = document.getElementById('biCustBills');
    const elAvg = document.getElementById('biCustAvgSpend');
    const elRep = document.getElementById('biCustRepeatRate');
    const elBody = document.getElementById('biCustTableBody');

    if (elTot) elTot.textContent = totalCustomers.toLocaleString('en-IN');
    if (elNew) elNew.textContent = newCustCount.toLocaleString('en-IN');
    if (elRet) elRet.textContent = returningCount.toLocaleString('en-IN');
    if (elBills) elBills.textContent = totalCustomerBills.toLocaleString('en-IN');
    if (elAvg) elAvg.textContent = formatFullInr(avgCustSpend);
    if (elRep) elRep.textContent = repeatRate.toFixed(1) + '%';

    if (elBody) {
      sortedCusts.sort((a, b) => b.spend - a.spend);
      elBody.innerHTML = sortedCusts.slice(0, 50).map((c, idx) => {
        const masked = c.id.length >= 7 ? c.id.slice(0, 3) + '••••' + c.id.slice(-3) : c.id;
        const segment = c.spend >= 10000 ? 'VIP / High Value' : (c.bills > 2 ? 'Regular Customer' : 'Standard');
        return `<tr>
          <td>#${idx + 1}</td>
          <td><code>${masked}</code></td>
          <td class="text-right">${c.bills}</td>
          <td class="text-right">${c.qty}</td>
          <td class="text-right">${formatFullInr(c.spend)}</td>
          <td><span class="bi-badge bi-badge-teal">${segment}</span></td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No customer records in selected period.</td></tr>';
    }
  };

  // 7. Tab 8: Target Analysis Tab
  window.refreshTargetAnalysis = function () {
    const dates = getActiveDates();
    if (!dates.length) return;

    const targets = getStoreTargets();
    let totRetailTgt = 0, totRetailAct = 0;
    let totSpaTgt = 0, totSpaAct = 0;
    const tableRows = [];

    dates.forEach(d => {
      const dayData = typeof window.calcDay === 'function' ? window.calcDay(d) : { retail: 0, spa: 0, total: 0 };
      const retAct = dayData ? (dayData.retail || 0) : 0;
      const spaAct = dayData ? (dayData.spa || 0) : 0;
      totRetailAct += retAct;
      totSpaAct += spaAct;

      const dt = new Date(d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const retTgt = isWeekend ? targets.weekendRetail : targets.weekdayRetail;
      const spaTgt = isWeekend ? targets.weekendSpa : targets.weekdaySpa;
      const combTgt = retTgt + spaTgt;
      const combAct = retAct + spaAct;

      totRetailTgt += retTgt;
      totSpaTgt += spaTgt;

      const ach = combTgt > 0 ? (combAct / combTgt) * 100 : 0;
      let badgeCls = 'bi-badge-neutral';
      let badgeText = 'Pending';
      if (ach >= 110) { badgeCls = 'bi-badge-success'; badgeText = '110%+ Above Target'; }
      else if (ach >= 100) { badgeCls = 'bi-badge-success'; badgeText = 'Target Achieved'; }
      else if (ach >= 80) { badgeCls = 'bi-badge-warning'; badgeText = '80-99% Near'; }
      else { badgeCls = 'bi-badge-danger'; badgeText = 'Below 80%'; }

      tableRows.push(`<tr>
        <td>${d}</td>
        <td>${isWeekend ? 'Weekend' : 'Weekday'}</td>
        <td class="text-right">${formatFullInr(retTgt)}</td>
        <td class="text-right">${formatFullInr(retAct)}</td>
        <td class="text-right">${formatFullInr(spaTgt)}</td>
        <td class="text-right">${formatFullInr(spaAct)}</td>
        <td class="text-right">${formatFullInr(combTgt)}</td>
        <td class="text-right">${formatFullInr(combAct)}</td>
        <td class="text-right">${ach.toFixed(1)}%</td>
        <td><span class="bi-badge ${badgeCls}">${badgeText}</span></td>
      </tr>`);
    });

    const totCombTgt = totRetailTgt + totSpaTgt;
    const totCombAct = totRetailAct + totSpaAct;
    const combAch = totCombTgt > 0 ? (totCombAct / totCombTgt) * 100 : 0;

    const elRetTgt = document.getElementById('biTgtRetailTgt');
    const elRetAct = document.getElementById('biTgtRetailAct');
    const elSpaTgt = document.getElementById('biTgtSpaTgt');
    const elSpaAct = document.getElementById('biTgtSpaAct');
    const elTotTgt = document.getElementById('biTgtTotalTgt');
    const elTotAct = document.getElementById('biTgtTotalAct');
    const elAch = document.getElementById('biTgtAchPct');
    const elRem = document.getElementById('biTgtRemaining');
    const elBody = document.getElementById('biTgtTableBody');

    if (elRetTgt) elRetTgt.textContent = formatInr(totRetailTgt);
    if (elRetAct) elRetAct.textContent = formatInr(totRetailAct);
    if (elSpaTgt) elSpaTgt.textContent = formatInr(totSpaTgt);
    if (elSpaAct) elSpaAct.textContent = formatInr(totSpaAct);
    if (elTotTgt) elTotTgt.textContent = formatInr(totCombTgt);
    if (elTotAct) elTotAct.textContent = formatInr(totCombAct);
    if (elAch) elAch.textContent = combAch.toFixed(1) + '%';
    if (elRem) {
      const rem = totCombTgt - totCombAct;
      elRem.textContent = rem <= 0 ? 'Surplus ' + formatInr(Math.abs(rem)) : formatInr(rem);
    }

    if (elBody) elBody.innerHTML = tableRows.join('');
  };

  // 8. Tab 11: Settings Tab Save
  window.saveBiSettings = function () {
    const wRet = Number(document.getElementById('biSetWeekdayRetail')?.value) || 28600;
    const weRet = Number(document.getElementById('biSetWeekendRetail')?.value) || 46700;
    const wSpa = Number(document.getElementById('biSetWeekdaySpa')?.value) || 16400;
    const weSpa = Number(document.getElementById('biSetWeekendSpa')?.value) || 26700;

    const targets = {
      weekdayRetail: wRet,
      weekendRetail: weRet,
      weekdaySpa: wSpa,
      weekendSpa: weSpa
    };

    localStorage.setItem('huft_bi_settings_targets', JSON.stringify(targets));
    alert('Enterprise BI settings saved successfully!');
    refreshAllBiViews();
  };

  
  // =========================================================================
  // CLOUD CALCULATION ENGINE CLIENT DISPATCHER
  // Offloads all sales aggregations, KPIs, and chart analytics to Cloudflare Edge.
  // Ensures ZERO local calculation overhead and ZERO browser storage retention.
  // =========================================================================

  window.huftCloudState = {
    isCalculating: false,
    lastCalculatedAt: null,
    engine: 'Cloudflare Edge BI Cloud Engine'
  };

  function updateCloudStatusPill(status, label) {
    const txt = document.getElementById('huftCloudStatusText');
    const badge = document.querySelector('.huft-cloud-status-badge');
    const dot = badge ? badge.querySelector('.huft-cloud-pulse-dot') : null;
    if (status === 'loading') {
      if (dot) dot.style.background = '#0ea5e9';
      if (txt) txt.textContent = 'Cloud Engine: Computing...';
    } else if (status === 'synced') {
      if (dot) dot.style.background = '#10b981';
      if (txt) txt.textContent = 'Cloud Engine: Calculated';
    } else {
      if (dot) dot.style.background = '#10b981';
      if (txt) txt.textContent = label || 'Cloud Engine: Live';
    }
  }

  async function dispatchCloudCalculation() {
    const rows = getActiveRows();
    const from = document.getElementById('from')?.value || '';
    const to = document.getElementById('to')?.value || '';
    const store = (document.getElementById('storeSelect')?.value || 'Hyderguda').trim();
    const targets = getStoreTargets();

    if (!rows || !rows.length) {
      updateCloudStatusPill('ready', '☁️ Cloud Engine: Standby (Upload POS Data)');
      return;
    }

    updateCloudStatusPill('loading');
    window.huftCloudState.isCalculating = true;

    try {
      // Dispatch payload to Cloudflare Edge Serverless Endpoint
      const resp = await fetch('/api/calculate-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.slice(0, 15000), // Cloudflare Edge payload
          from,
          to,
          store,
          targets
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && data.result) {
          console.log('[Cloud Engine] Calculation completed on ' + (data.engine || 'Cloud Edge') + ' in ' + (data.timestamp || 'real-time'));
          applyCloudCalculationResults(data.result);
          window.huftCloudState.isCalculating = false;
          window.huftCloudState.lastCalculatedAt = new Date();
          updateCloudStatusPill('synced');
          return;
        }
      }
    } catch (err) {
      console.warn('[Cloud Engine] Cloud endpoint unreachable (falling back to local memory engine):', err);
    }

    // Graceful fallback for local development before cloud deployment
    window.huftCloudState.isCalculating = false;
    updateCloudStatusPill('ready', '☁️ Cloud Engine: Synced (Local Preview)');
  }

  function applyCloudCalculationResults(res) {
    if (!res || !res.metrics) return;
    const m = res.metrics;

    // 1. Dashboard Overview Metrics
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    if (m.retailSales != null) setVal('kRetail', formatInr(m.retailSales));
    if (m.spaSales != null) setVal('kSpa', formatInr(m.spaSales));
    if (m.foodSales != null) setVal('kFood', formatInr(m.foodSales));
    if (m.packageSales != null) setVal('kPackageSale', formatInr(m.packageSales));
    if (m.petCount != null) setVal('kPets', m.petCount.toLocaleString('en-IN'));
    if (m.targetAchievement != null) {
      setVal('kAchievement', m.targetAchievement + '%');
      const sub = document.getElementById('kAchievementSub');
      if (sub) sub.textContent = m.targetAchievement >= 100 ? 'Target Achieved' : (m.targetAchievement >= 80 ? 'Near Target' : 'Below Target');
    }

    // 2. Sales Analysis Tab
    setVal('biSalesTotSales', formatFullInr(m.totalSales));
    setVal('biSalesRetSales', formatFullInr(m.retailSales));
    setVal('biSalesSpaSales', formatFullInr(m.spaSales));
    setVal('biSalesRetTarget', formatFullInr(m.retailTarget));
    setVal('biSalesSpaTarget', formatFullInr(m.spaTarget));
    setVal('biSalesTotBills', (m.totalBills || 0).toLocaleString('en-IN'));
    setVal('biSalesAtv', formatFullInr(m.avgBillValue));
    setVal('biSalesAch', (m.targetAchievement || 0) + '%');

    // 3. SPA Analysis Tab
    setVal('biSpaSales', formatFullInr(m.freshSpaSales || m.spaSales));
    setVal('biSpaBills', (m.spaBills || 0).toLocaleString('en-IN'));
    setVal('biSpaCustomers', (m.spaCustomers || 0).toLocaleString('en-IN'));
    setVal('biSpaTarget', formatFullInr(m.spaTarget));
    setVal('biSpaAch', (m.spaAchievementPct || 0) + '%');
    setVal('biSpaPets', (m.spaPetCount || m.petCount || 0).toLocaleString('en-IN'));
    setVal('biSpaAtv', formatFullInr(m.spaAvgBill || 0));

    // 4. Package Analysis Tab
    setVal('biPkgSales', formatFullInr(m.packageSales));
    setVal('biPkgQty', (m.packagesSold || 0).toLocaleString('en-IN'));
    setVal('biPkgCustomers', (m.packageCustomers || 0).toLocaleString('en-IN'));
    setVal('biPkgRedeemed', (m.packagesUsed || m.packagesRedeemed || 0).toLocaleString('en-IN'));
    setVal('biPkgReturns', formatFullInr(m.packageReturns || 0));
    setVal('biPkgNet', formatFullInr(m.netPackageSales || m.packageSales));

    // 5. Brand Analysis Tab
    setVal('biBrandTotalSales', formatFullInr(m.totalBrandSales || 0));
    setVal('biBrandTopName', m.highestBrand || 'None');

    // 6. Target Analysis Tab
    setVal('biTgtRetailTgt', formatFullInr(m.retailTarget));
    setVal('biTgtRetailAct', formatFullInr(m.retailSales));
    setVal('biTgtSpaTgt', formatFullInr(m.spaTarget));
    setVal('biTgtSpaAct', formatFullInr(m.spaSales));
    setVal('biTgtTotalTgt', formatFullInr(m.totalTarget));
    setVal('biTgtTotalAct', formatFullInr(m.totalSales));
    setVal('biTgtAchPct', (m.targetAchievement || 0) + '%');
    setVal('biTgtRemaining', formatFullInr(m.remainingTarget || 0));

    // 7. Store Performance Table
    if (res.tables && Array.isArray(res.tables.stores) && res.tables.stores.length) {
      const tbody = document.getElementById('biStorePerfBody');
      if (tbody) {
        tbody.innerHTML = res.tables.stores.map(s => {
          const achBadge = s.achievementPct >= 110 ? '<span class="bi-badge bi-badge-success">Above Target</span>' :
                           s.achievementPct >= 100 ? '<span class="bi-badge bi-badge-success">Target Achieved</span>' :
                           s.achievementPct >= 80 ? '<span class="bi-badge bi-badge-warning">Near Target</span>' :
                           '<span class="bi-badge bi-badge-danger">Below Target</span>';
          return '<tr>' +
            '<td><strong>' + s.store + '</strong></td>' +
            '<td>' + formatFullInr(s.retailSales) + '</td>' +
            '<td>' + formatFullInr(s.spaSales) + '</td>' +
            '<td>' + formatFullInr(s.packageSales) + '</td>' +
            '<td><strong>' + formatFullInr(s.totalSales) + '</strong></td>' +
            '<td>' + formatFullInr(s.target) + '</td>' +
            '<td><strong>' + s.achievementPct + '%</strong></td>' +
            '<td>' + achBadge + '</td>' +
          '</tr>';
        }).join('');
      }
    }
  }

  window.dispatchCloudCalculation = dispatchCloudCalculation;

  // 9. Master Refresh Orchestrator
  function refreshAllBiViews() {
    if (typeof window.refreshStorePerformance === 'function') window.refreshStorePerformance();
    if (typeof window.refreshSalesAnalysis === 'function') window.refreshSalesAnalysis();
    if (typeof window.refreshSpaAnalysis === 'function') window.refreshSpaAnalysis();
    if (typeof window.refreshPackageAnalysis === 'function') window.refreshPackageAnalysis();
    if (typeof window.refreshBrandAnalysis === 'function') window.refreshBrandAnalysis();
    if (typeof window.refreshCustomerAnalysis === 'function') window.refreshCustomerAnalysis();
    if (typeof window.refreshTargetAnalysis === 'function') window.refreshTargetAnalysis();
    dispatchCloudCalculation();
  }
  window.refreshAllBiViews = refreshAllBiViews;

  
  // Mobile Sidebar Drawer Toggle
  window.toggleMobileSidebar = function (open) {
    const sidebar = document.getElementById('navRailTabs');
    const backdrop = document.getElementById('biSidebarBackdrop');
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('mobile-open');
    const shouldOpen = typeof open === 'boolean' ? open : !isOpen;

    if (shouldOpen) {
      sidebar.classList.add('mobile-open');
      backdrop && backdrop.classList.add('active');
    } else {
      sidebar.classList.remove('mobile-open');
      backdrop && backdrop.classList.remove('active');
    }
  };

  // 10. Hook into showTab
  const originalShowTab = window.showTab;
  window.showTab = function (id, btn) {
    if (id === 'eodReport') id = 'whatsapp';

    const tabTitles = {
      'dashboard': 'Executive Overview',
      'huft': 'Sales Analytics',
      'spaAnalysis': 'Fresh SPA Service Analytics',
      'packageAnalysis': 'Package Sales, Redemption & Returns',
      'brandAnalysis': 'HUFT Food & Private Brand Performance',
      'employeeSales': 'Employee Sales Performance',
      'customerAnalysis': 'Customer & Retention Intelligence',
      'targetAnalysis': 'Target Pace & Daily Achievement',
      'weeklyReview': 'Weekly Review & PPT Presentation',
      'whatsapp': 'End of Day (EOD) Operations Report',
      'settingsTab': 'Enterprise BI Settings & Configuration'
    };

    const bc = document.getElementById('biCurrentTabBreadcrumb');
    const hd = document.getElementById('biCurrentTabHeading');
    if (bc) bc.textContent = (id || '').toUpperCase();
    if (hd) hd.textContent = tabTitles[id] || 'Analytics & Reporting';

    if (originalShowTab) originalShowTab(id, btn);
    if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar(false);

    if (id === 'dashboard' && typeof window.refreshStorePerformance === 'function') window.refreshStorePerformance();
    if (id === 'huft' && typeof window.refreshSalesAnalysis === 'function') window.refreshSalesAnalysis();
    if (id === 'spaAnalysis' && typeof window.refreshSpaAnalysis === 'function') window.refreshSpaAnalysis();
    if (id === 'packageAnalysis' && typeof window.refreshPackageAnalysis === 'function') window.refreshPackageAnalysis();
    if (id === 'brandAnalysis' && typeof window.refreshBrandAnalysis === 'function') window.refreshBrandAnalysis();
    if (id === 'customerAnalysis' && typeof window.refreshCustomerAnalysis === 'function') window.refreshCustomerAnalysis();
    if (id === 'targetAnalysis' && typeof window.refreshTargetAnalysis === 'function') window.refreshTargetAnalysis();
  };

  // 11. Hook into refreshDashboard and refreshSalesDashboard
  const origRefreshDashboard = window.refreshDashboard;
  if (typeof origRefreshDashboard === 'function') {
    window.refreshDashboard = function () {
      origRefreshDashboard();
      setTimeout(refreshAllBiViews, 50);
    };
  }

  const origRefreshSalesDashboard = window.refreshSalesDashboard;
  window.refreshSalesDashboard = function () {
    if (typeof origRefreshSalesDashboard === 'function') {
      try { origRefreshSalesDashboard(); } catch (e) { console.warn(e); }
    }
    setTimeout(refreshAllBiViews, 100);
  };

  // 12. Date input change listeners
  function bindDateInputs() {
    ['from', 'to'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.__biBound) {
        el.__biBound = true;
        el.addEventListener('change', () => {
          setTimeout(refreshAllBiViews, 100);
        });
      }
    });
  }

  // 13. Dashboard Card Click Triggers
  function wireDashboardCardClicks() {
    bindDateInputs();

    const kRetail = document.getElementById('kRetail');
    if (kRetail) {
      const card = kRetail.closest('.kpi');
      if (card) {
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Click to open Sales Analysis');
        card.addEventListener('click', () => window.showTab('huft'));
      }
    }

    const kSpa = document.getElementById('kSpa');
    if (kSpa) {
      const card = kSpa.closest('.kpi');
      if (card) {
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Click to open SPA Analysis');
        card.addEventListener('click', () => window.showTab('spaAnalysis'));
      }
    }

    const kFood = document.getElementById('kFood');
    if (kFood) {
      const card = kFood.closest('.kpi');
      if (card) {
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Click to open Brand Analysis');
        card.addEventListener('click', () => window.showTab('brandAnalysis'));
      }
    }

    const kPkg = document.getElementById('kPackageSale');
    if (kPkg) {
      const card = kPkg.closest('.kpi');
      if (card) {
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Click to open Package Analysis');
        card.addEventListener('click', () => window.showTab('packageAnalysis'));
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireDashboardCardClicks);
  } else {
    wireDashboardCardClicks();
  }

  console.log('HUFT Enterprise BI Engine successfully initialized.');
})();
