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
      if (dates.length) return dates;
    }

    if (Array.isArray(window.rows) && window.rows.length) {
      const keys = [...new Set(window.rows.map(r => r._key).filter(k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)))].sort();
      return keys.filter(d => (!F || d >= F) && (!T || d <= T));
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

  // 1. SPA Analysis Tab
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

      // Count distinct bills and customers
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
        <td>${formatFullInr(spaSales)}</td>
        <td>${dayPets}</td>
        <td>${formatFullInr(dayTarget)}</td>
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

  // 2. Package Analysis Tab
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

    // Sales table (6 columns: Invoice Number, Date, Store, Employee, Package Amount, Quantity)
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

    // Redemption table (6 columns: Invoice, Date, Store, Discount / Tag, Payment Method, Redemption Count)
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

    // Return table (6 columns: Return Invoice, Original Invoice, Date, Store, Return Amount, Quantity)
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

  // 3. Brand Analysis Tab
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

  // 4. Customer Analysis Tab
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

    const elTotal = document.getElementById('biCustTotal');
    const elNew = document.getElementById('biCustNew');
    const elReturning = document.getElementById('biCustReturning');
    const elBills = document.getElementById('biCustBills');
    const elAtv = document.getElementById('biCustAtv');
    const elRepeat = document.getElementById('biCustRepeatPct');
    const elBody = document.getElementById('biCustTableBody');

    if (elTotal) elTotal.textContent = totalCustomers.toLocaleString('en-IN');
    if (elNew) elNew.textContent = newCustCount.toLocaleString('en-IN');
    if (elReturning) elReturning.textContent = returningCount.toLocaleString('en-IN');
    if (elBills) elBills.textContent = totalCustomerBills.toLocaleString('en-IN');
    if (elAtv) elAtv.textContent = formatFullInr(avgCustSpend);
    if (elRepeat) elRepeat.textContent = repeatRate.toFixed(1) + '%';

    function maskPhone(str) {
      if (!str) return '—';
      const clean = str.replace(/[^0-9]/g, '');
      if (clean.length >= 10) {
        return clean.slice(0, 2) + '******' + clean.slice(-2);
      }
      return str.slice(0, 2) + '***';
    }

    if (elBody) {
      sortedCusts.sort((a, b) => b.spend - a.spend);
      // 6 columns matching thead: Customer Identifier, Total Spend (₹), Total Invoices, Average Ticket (₹), Units Bought, Customer Type
      elBody.innerHTML = sortedCusts.slice(0, 50).map(c => {
        const type = c.bills > 1 ? '<span class="bi-badge bi-badge-success">Returning</span>' : '<span class="bi-badge bi-badge-neutral">New</span>';
        const atv = c.bills > 0 ? Math.round(c.spend / c.bills) : 0;
        return `<tr>
          <td>${maskPhone(c.id)}</td>
          <td class="text-right">${formatFullInr(c.spend)}</td>
          <td class="text-right">${c.bills}</td>
          <td class="text-right">${formatFullInr(atv)}</td>
          <td class="text-right">${Math.round(c.qty)}</td>
          <td>${type}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No customer transactions available.</td></tr>';
    }
  };

  // 5. Target Analysis Tab
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

      // 10 columns matching thead: Date, Day Type, Retail Target, Retail Actual, SPA Target, SPA Actual, Total Target, Total Actual, Achievement %, Status
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
    const elTotAch = document.getElementById('biTgtTotalAch');
    const elRem = document.getElementById('biTgtRemaining');
    const elProj = document.getElementById('biTgtProjected');
    const elBody = document.getElementById('biTargetTableBody');

    if (elRetTgt) elRetTgt.textContent = formatInr(totRetailTgt);
    if (elRetAct) elRetAct.textContent = formatInr(totRetailAct);
    if (elSpaTgt) elSpaTgt.textContent = formatInr(totSpaTgt);
    if (elSpaAct) elSpaAct.textContent = formatInr(totSpaAct);
    if (elTotTgt) elTotTgt.textContent = formatInr(totCombTgt);
    if (elTotAch) elTotAch.textContent = combAch.toFixed(1) + '%';
    if (elRem) elRem.textContent = formatInr(Math.max(0, totCombTgt - totCombAct));
    if (elProj) elProj.textContent = formatInr(totCombAct);
    if (elBody) elBody.innerHTML = tableRows.join('');
  };

  // 6. Settings Tab
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
    if (typeof window.refreshTargetAnalysis === 'function') window.refreshTargetAnalysis();
    if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  };

  // Hook into showTab
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

    if (id === 'spaAnalysis' && typeof window.refreshSpaAnalysis === 'function') window.refreshSpaAnalysis();
    if (id === 'packageAnalysis' && typeof window.refreshPackageAnalysis === 'function') window.refreshPackageAnalysis();
    if (id === 'brandAnalysis' && typeof window.refreshBrandAnalysis === 'function') window.refreshBrandAnalysis();
    if (id === 'customerAnalysis' && typeof window.refreshCustomerAnalysis === 'function') window.refreshCustomerAnalysis();
    if (id === 'targetAnalysis' && typeof window.refreshTargetAnalysis === 'function') window.refreshTargetAnalysis();
  };

  // Hook into refreshDashboard
  const origRefreshDashboard = window.refreshDashboard;
  if (typeof origRefreshDashboard === 'function') {
    window.refreshDashboard = function () {
      origRefreshDashboard();
      setTimeout(function () {
        if (typeof window.refreshSpaAnalysis === 'function') window.refreshSpaAnalysis();
        if (typeof window.refreshPackageAnalysis === 'function') window.refreshPackageAnalysis();
        if (typeof window.refreshBrandAnalysis === 'function') window.refreshBrandAnalysis();
        if (typeof window.refreshCustomerAnalysis === 'function') window.refreshCustomerAnalysis();
        if (typeof window.refreshTargetAnalysis === 'function') window.refreshTargetAnalysis();
      }, 100);
    };
  }

  // Dashboard Card Click triggers
  function wireDashboardCardClicks() {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireDashboardCardClicks);
  } else {
    wireDashboardCardClicks();
  }

  console.log('HUFT Enterprise BI Engine successfully initialized.');
})();
