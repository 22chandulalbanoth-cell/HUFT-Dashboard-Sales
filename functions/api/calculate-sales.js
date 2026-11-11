/**
 * Cloud Sales Calculation Engine
 * Cloudflare Pages Function: /api/calculate-sales
 *
 * Runs 100% on Cloudflare Edge Cloud servers.
 * Computes all HUFT sales aggregations, KPIs, brand metrics, employee stats, and chart datasets.
 * Browser acts purely as a thin display client with ZERO local storage.
 */

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const filterFrom = body.from || '';
    const filterTo = body.to || '';
    const filterStore = (body.store || '').trim().toLowerCase();
    const targets = body.targets || {};

    const result = calculateSalesInCloud(rows, filterFrom, filterTo, filterStore, targets);

    return new Response(JSON.stringify({
      success: true,
      cloudCalculated: true,
      timestamp: new Date().toISOString(),
      engine: 'Cloudflare Edge BI Cloud Engine',
      result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Cloud calculation failed'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

function calculateSalesInCloud(rows, filterFrom, filterTo, filterStore, targets) {
  const BRANDS = [
    { name: "Sara's Wholesome", needle: "sara" },
    { name: "Hearty", needle: "hearty" },
    { name: "Meowsi", needle: "meowsi" },
    { name: "NutriMeow", needle: "nutrimeow" },
    { name: "NutriWag", needle: "nutriwag" }
  ];

  function num(val) {
    if (val == null || val === '') return 0;
    const n = Number(String(val).replace(/,/g, '').replace(/[₹$]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function getRowAmount(r) {
    return num(r.Amount || r.amount || r['Line Subtotal'] || r['Untaxed Amount'] || r['Price Subtotal'] || r['Subtotal'] || r['Column M'] || r._amount || 0);
  }

  function getRowQty(r) {
    return num(r.Quantity || r.quantity || r.Qty || r.qty || r['Column L'] || r._qty || 1);
  }

  function getRowDate(r) {
    const raw = String(r.Date || r.date || r['Order Date'] || r['Invoice Date'] || r._key || r['Column D'] || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
    // Parse DD-MM-YYYY or DD/MM/YYYY
    const parts = raw.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
      }
    }
    return raw.substring(0, 10);
  }

  function getRowStore(r) {
    return String(r.Store || r.store || r['Warehouse'] || r['Store Name'] || r._store || r['Column B'] || 'Hyderguda').trim();
  }

  function isSpaCategory(r) {
    const cat = String(r['Order Lines/Product/Product Category'] || r.Category || r.category || r['Product Category'] || r['Column K'] || '').toLowerCase();
    return /^spa\s+services?/.test(cat.split('/')[0].trim());
  }

  function isAdhygPackage(r) {
    const inv = String(r['Invoice/Display Name'] || r['Invoice Number'] || r['Column F'] || r._invoiceDisplayName || '').trim();
    return /^(?:RET-)?AD[A-Z0-9_-]*(?:\/|\b)|\bReversal\s+of:\s*AD[A-Z0-9_-]*/i.test(inv);
  }

  function isSpaWalletRedemption(r) {
    const pay = String(r['Payment Method'] || r['Payment Mode'] || r.Payment || r._paymentMethod || r['Column V'] || '').toLowerCase();
    const discount = num(r['Discount %'] || r.Discount || r._discount || 0);
    return /\bspa\s+wallet\b/i.test(pay) && [10, 15, 20, 30].includes(Math.round(discount));
  }

  function isFoodRow(r) {
    const cat = String(r['Order Lines/Product/Product Category'] || r.Category || '').toLowerCase();
    const prod = String(r['Order Lines/Product/Name'] || r.Product || r['Product Name'] || '').toLowerCase();
    return cat.includes('food') || /dog food|cat food|pet food|dry food|wet food/i.test(prod);
  }

  function isReturnRow(r) {
    const inv = String(r['Invoice/Display Name'] || r['Invoice Number'] || r['Column F'] || '').trim();
    const type = String(r['Order Type'] || r['Document Type'] || '').trim();
    const amt = getRowAmount(r);
    return /\bRET-|\bReversal\b|^R-/i.test(inv) || /return|credit\s*note/i.test(type) || amt < 0;
  }

  // Filter rows
  const activeRows = rows.filter(r => {
    const d = getRowDate(r);
    if (filterFrom && d && d < filterFrom) return false;
    if (filterTo && d && d > filterTo) return false;
    if (filterStore && filterStore !== 'all') {
      const s = getRowStore(r).toLowerCase();
      if (!s.includes(filterStore)) return false;
    }
    return true;
  });

  // Calculate Metrics
  let totalSales = 0;
  let retailSales = 0;
  let spaSales = 0;
  let packageSales = 0;
  let packagesUsed = 0;
  let foodSales = 0;
  let unitsSold = 0;
  let packageReturns = 0;
  let packagesRedeemedCount = 0;

  const billSet = new Set();
  const customerSet = new Set();
  const spaBillSet = new Set();
  const spaCustomerSet = new Set();
  const petSet = new Set();
  const dateMap = new Map();
  const storeMap = new Map();
  const brandMap = new Map();
  const employeeMap = new Map();
  const hourlyMap = new Map();

  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, { hour: i, sales: 0, bills: new Set() });
  }

  BRANDS.forEach(b => brandMap.set(b.name, { brand: b.name, sales: 0, qty: 0, bills: new Set() }));

  activeRows.forEach((r, idx) => {
    const amt = getRowAmount(r);
    const q = getRowQty(r);
    const d = getRowDate(r);
    const s = getRowStore(r);
    const bill = String(r['Invoice/Display Name'] || r['Invoice Number'] || r['Column F'] || r._invoiceDisplayName || ('bill_' + idx)).trim();
    const cust = String(r.Customer || r['Customer Name'] || r['Column G'] || r['Customer Phone'] || '').trim();
    const emp = String(r.Salesperson || r['Sales Person'] || r['Employee'] || r['Column AC'] || 'Store Staff').trim();
    const prod = String(r['Order Lines/Product/Name'] || r.Product || r['Product Name'] || '').toLowerCase();
    const pet = String(r['Pet Name'] || r.Pet || r['Column H'] || '').trim();

    if (bill) billSet.add(bill);
    if (cust) customerSet.add(cust);
    unitsSold += q;

    const isSpa = isSpaCategory(r);
    const isPkg = isAdhygPackage(r);
    const isRedemp = isSpa && isSpaWalletRedemption(r);
    const isRet = isReturnRow(r);

    if (isRet && isPkg) {
      packageReturns += Math.abs(amt);
    }

    if (isRedemp) {
      packagesUsed += Math.abs(q) || 1;
      packagesRedeemedCount++;
    } else if (isPkg) {
      packageSales += amt;
    } else if (isSpa) {
      spaSales += amt;
      if (bill) spaBillSet.add(bill);
      if (cust) spaCustomerSet.add(cust);
      if (pet) petSet.add(pet);
    } else {
      retailSales += amt;
    }

    if (isFoodRow(r)) {
      foodSales += amt;
    }

    totalSales += amt;

    // Daily breakdown
    if (d) {
      if (!dateMap.has(d)) {
        dateMap.set(d, { date: d, total: 0, retail: 0, spa: 0, package: 0, food: 0, bills: new Set(), pets: new Set() });
      }
      const dayData = dateMap.get(d);
      dayData.total += amt;
      if (isSpa && !isRedemp && !isPkg) dayData.spa += amt;
      else if (isPkg) dayData.package += amt;
      else if (!isRedemp) dayData.retail += amt;
      if (isFoodRow(r)) dayData.food += amt;
      if (bill) dayData.bills.add(bill);
      if (pet) dayData.pets.add(pet);
    }

    // Store breakdown
    if (!storeMap.has(s)) {
      storeMap.set(s, { store: s, retailSales: 0, spaSales: 0, packageSales: 0, totalSales: 0 });
    }
    const storeData = storeMap.get(s);
    storeData.totalSales += amt;
    if (isSpa && !isRedemp && !isPkg) storeData.spaSales += amt;
    else if (isPkg) storeData.packageSales += amt;
    else if (!isRedemp) storeData.retailSales += amt;

    // Brand breakdown
    BRANDS.forEach(b => {
      if (prod.includes(b.needle)) {
        const bd = brandMap.get(b.name);
        bd.sales += amt;
        bd.qty += q;
        if (bill) bd.bills.add(bill);
      }
    });

    // Employee breakdown
    if (emp) {
      if (!employeeMap.has(emp)) {
        employeeMap.set(emp, { employee: emp, store: s, retailSales: 0, spaSales: 0, packageSales: 0, foodSales: 0, totalSales: 0, bills: new Set(), qty: 0 });
      }
      const ed = employeeMap.get(emp);
      ed.totalSales += amt;
      ed.qty += q;
      if (bill) ed.bills.add(bill);
      if (isSpa && !isRedemp && !isPkg) ed.spaSales += amt;
      else if (isPkg) ed.packageSales += amt;
      else if (!isRedemp) ed.retailSales += amt;
      if (isFoodRow(r)) ed.foodSales += amt;
    }

    // Hourly
    const timeRaw = String(r.Time || r['Order Time'] || r['Invoice Time'] || '').trim();
    if (timeRaw) {
      const matchHour = timeRaw.match(/(\d{1,2}):/);
      if (matchHour) {
        const h = parseInt(matchHour[1], 10);
        if (h >= 0 && h < 24) {
          const hd = hourlyMap.get(h);
          hd.sales += amt;
          if (bill) hd.bills.add(bill);
        }
      }
    }
  });

  const totalBills = billSet.size || (totalSales > 0 ? 1 : 0);
  const totalCustomers = customerSet.size || (totalSales > 0 ? 1 : 0);
  const avgBillValue = totalBills > 0 ? Math.round(totalSales / totalBills) : 0;
  const petCount = petSet.size || spaBillSet.size;

  // Targets
  const numDays = Math.max(1, dateMap.size);
  const totalTarget = targets.totalTarget || (numDays * 45000);
  const retailTarget = targets.retailTarget || (totalTarget * 0.636);
  const spaTarget = targets.spaTarget || (totalTarget * 0.364);
  const achievementPct = totalTarget > 0 ? Number(((totalSales / totalTarget) * 100).toFixed(1)) : 0;

  // Daily Array
  const dailyArray = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    date: d.date,
    totalSales: d.total,
    retailSales: d.retail,
    spaSales: d.spa,
    packageSales: d.package,
    foodSales: d.food,
    bills: d.bills.size,
    petCount: d.pets.size,
    achievement: totalTarget > 0 ? Number(((d.total / (totalTarget / numDays)) * 100).toFixed(1)) : 100
  }));

  // Store Array
  const storeArray = Array.from(storeMap.values()).map(s => ({
    store: s.store,
    retailSales: s.retailSales,
    spaSales: s.spaSales,
    packageSales: s.packageSales,
    totalSales: s.totalSales,
    target: totalTarget,
    achievementPct: totalTarget > 0 ? Number(((s.totalSales / totalTarget) * 100).toFixed(1)) : 0
  }));

  // Brand Array
  const brandArray = Array.from(brandMap.values()).map(b => ({
    brand: b.brand,
    sales: b.sales,
    qty: b.qty,
    bills: b.bills.size,
    contributionPct: totalSales > 0 ? Number(((b.sales / totalSales) * 100).toFixed(1)) : 0
  }));

  // Employee Array
  const employeeArray = Array.from(employeeMap.values()).map(e => ({
    employee: e.employee,
    store: e.store,
    retailSales: e.retailSales,
    spaSales: e.spaSales,
    packageSales: e.packageSales,
    foodSales: e.foodSales,
    totalSales: e.totalSales,
    bills: e.bills.size,
    qty: e.qty,
    avgBill: e.bills.size > 0 ? Math.round(e.totalSales / e.bills.size) : 0,
    contributionPct: totalSales > 0 ? Number(((e.totalSales / totalSales) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.totalSales - a.totalSales);

  // Hourly Array
  const hourlyArray = Array.from(hourlyMap.values()).map(h => ({
    hour: h.hour + ':00',
    sales: h.sales,
    bills: h.bills.size
  }));

  return {
    metrics: {
      totalSales,
      retailSales,
      spaSales,
      packageSales,
      packagesUsed,
      foodSales,
      totalBills,
      totalCustomers,
      avgBillValue,
      petCount,
      unitsSold,
      targetAchievement: achievementPct,
      freshSpaSales: spaSales,
      spaBills: spaBillSet.size,
      spaCustomers: spaCustomerSet.size,
      spaTarget,
      spaAchievementPct: spaTarget > 0 ? Number(((spaSales / spaTarget) * 100).toFixed(1)) : 0,
      spaPetCount: petCount,
      spaAvgBill: spaBillSet.size > 0 ? Math.round(spaSales / spaBillSet.size) : 0,
      packagesRedeemed: packagesRedeemedCount,
      packageReturns,
      netPackageSales: packageSales - packageReturns,
      totalBrandSales: brandArray.reduce((acc, b) => acc + b.sales, 0),
      highestBrand: brandArray.slice().sort((a, b) => b.sales - a.sales)[0]?.brand || 'None',
      totalEmployeeSales: totalSales,
      highestPerformer: employeeArray[0]?.employee || 'Store Staff',
      retailTarget,
      totalTarget,
      remainingTarget: Math.max(0, totalTarget - totalSales),
      projectedSales: totalSales * 1.05
    },
    tables: {
      daily: dailyArray,
      stores: storeArray,
      brands: brandArray,
      employees: employeeArray
    },
    charts: {
      trend: {
        labels: dailyArray.map(d => d.date),
        total: dailyArray.map(d => d.totalSales),
        retail: dailyArray.map(d => d.retailSales),
        spa: dailyArray.map(d => d.spaSales)
      },
      hourly: {
        labels: hourlyArray.map(h => h.hour),
        sales: hourlyArray.map(h => h.sales),
        bills: hourlyArray.map(h => h.bills)
      },
      brands: {
        labels: brandArray.map(b => b.brand),
        sales: brandArray.map(b => b.sales)
      },
      employees: {
        labels: employeeArray.slice(0, 10).map(e => e.employee),
        sales: employeeArray.slice(0, 10).map(e => e.totalSales)
      }
    }
  };
}
