// Compiles every inline <script> block in the deployable HTML files (no execution).
// Fails the build on any syntax error and on hardcoded credentials.
const fs = require('fs');
const vm = require('vm');

const files = ['index.html', 'admin.html'];
const forbidden = [['Chandu', '@123'].join(''), ['HuftStore', '#2026'].join(''), ['EnterpriseAdmin', '2026'].join(''), 'SUPABASE_SERVICE_ROLE_KEY', 'service_role'];
let errors = 0;

if (!fs.readFileSync('index.html', 'utf8').includes('id="huft-auth-ai-engine"')) {
  console.error('❌ index.html is missing the huft-auth-ai-engine script');
  errors++;
}

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');

  for (const word of forbidden) {
    if (html.includes(word)) {
      console.error(`❌ ${file} contains forbidden credential/secret text: ${word}`);
      errors++;
    }
  }

  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const code = m[1];
    i++;
    if (!code.trim()) continue;
    try {
      new vm.Script(code, { filename: `${file}#script${i}` });
    } catch (e) {
      console.error(`❌ Syntax error in ${file} inline script #${i}: ${e.message}`);
      errors++;
    }
  }
  console.log(`✅ ${file}: checked ${i} inline script block(s)`);
}

if (errors) {
  console.error(`\n${errors} problem(s) found.`);
  process.exit(1);
}
console.log('All inline scripts compile and no forbidden secrets found.');
