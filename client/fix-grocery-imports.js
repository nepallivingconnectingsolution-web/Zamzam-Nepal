const fs = require('fs');

const files = [
  'src/modules/grocery/groceries.controller.ts',
  'src/modules/grocery/partner-groceries.controller.ts',
];

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content;

  content = content.replace(/from '\.\/grocery\.dto'/g, "from './dto/grocery.dto'");

  if (content === before) {
    console.log(`${filePath}: no changes made — pattern not found (may already be fixed).`);
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${filePath}: patched successfully.`);
  }
}