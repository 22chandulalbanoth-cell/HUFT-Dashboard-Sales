/**
 * check-sql-security.js - Automated SQL Security Verification Guard
 * 
 * Scans SQL files for unauthorized anonymous grants or overly permissive RLS bypasses.
 * Enforces zero anon access and strict user/admin-scoped row-level security policies.
 * 
 * Forbidden patterns:
 * 1. "TO anon" (or grants/policies to anon role)
 * 2. "USING (true)" (unrestricted read access)
 * 3. "WITH CHECK (true)" (unrestricted write access)
 * 4. "GRANT ALL" (over-privileged permission grants)
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const FORBIDDEN_RULES = [
  {
    name: 'TO anon',
    pattern: /\bTO\s+anon\b/i,
    description: 'Direct grant or policy assignment to the untrusted anon role'
  },
  {
    name: 'USING (true)',
    pattern: /\bUSING\s*\(\s*true\s*\)/i,
    description: 'Unscoped RLS read policy bypassing access restrictions'
  },
  {
    name: 'WITH CHECK (true)',
    pattern: /\bWITH\s+CHECK\s*\(\s*true\s*\)/i,
    description: 'Unscoped RLS write policy allowing arbitrary insertions/modifications'
  },
  {
    name: 'GRANT ALL',
    pattern: /\bGRANT\s+ALL\b/i,
    description: 'Overly permissive broad GRANT statement'
  }
];

function findSqlFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git') {
        results = results.concat(findSqlFiles(fullPath));
      }
    } else if (item.isFile() && item.name.endsWith('.sql')) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log("==================================================================");
console.log("🛡️  AUTOMATED SQL SECURITY AUDIT CHECK");
console.log("==================================================================\n");

const sqlFiles = findSqlFiles(repoRoot);

if (sqlFiles.length === 0) {
  console.log("⚠️ No SQL files discovered under REPO.");
  process.exit(0);
}

let violationsCount = 0;
let checkedFiles = 0;

for (const filePath of sqlFiles) {
  checkedFiles++;
  const relativePath = path.relative(repoRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Strip comments for checking
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) return;

    for (const rule of FORBIDDEN_RULES) {
      if (rule.pattern.test(line)) {
        violationsCount++;
        console.error(`❌ [VIOLATION] ${relativePath}:${index + 1}`);
        console.error(`   Rule: "${rule.name}" (${rule.description})`);
        console.error(`   Line: ${trimmed}\n`);
      }
    }
  });
}

console.log("==================================================================");
console.log(`Audited ${checkedFiles} SQL file(s) across REPO`);

if (violationsCount > 0) {
  console.error(`❌ FAILED: Found ${violationsCount} security violation(s) in SQL files.`);
  process.exit(1);
} else {
  console.log(`✅ PASSED: 0 security violations found.`);
  console.log(`   - No "TO anon"`);
  console.log(`   - No "USING (true)"`);
  console.log(`   - No "WITH CHECK (true)"`);
  console.log(`   - No "GRANT ALL"`);
  console.log("==================================================================\n");
  process.exit(0);
}
