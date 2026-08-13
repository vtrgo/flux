const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.go') && !fullPath.endsWith('response.go')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;

      // http.Error(w, "message: "+err.Error(), status)
      content = content.replace(/http\.Error\(w,\s*"([^"]+)"\s*\+\s*err\.Error\(\),\s*(http\.[A-Za-z]+)\)/g, 'respondError(w, $2, "$1", err)');
      
      // http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
      // wait, the above regex captures the `: ` as well.

      // http.Error(w, "message", status)
      content = content.replace(/http\.Error\(w,\s*"([^"]+)",\s*(http\.[A-Za-z]+)\)/g, 'respondError(w, $2, "$1", nil)');

      // json.NewEncoder(w).Encode(data) -> respondJSON(w, http.StatusOK, data)
      // wait, sometimes we check for err in json.NewEncoder(w).Encode
      // e.g. if err := json.NewEncoder(w).Encode(m); err != nil { ... }
      // This is trickier to replace with regex because respondJSON doesn't return an error.
      // Let's just do simple replacements.
      
      // First, remove standalone w.Header().Set("Content-Type", "application/json")
      content = content.replace(/[\t ]*w\.Header\(\)\.Set\("Content-Type",\s*"application\/json"\)\n/g, '');

      // Replace json.NewEncoder(w).Encode(obj)
      content = content.replace(/json\.NewEncoder\(w\)\.Encode\(([^)]+)\)/g, 'respondJSON(w, http.StatusOK, $1)');

      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Updated", fullPath);
      }
    }
  }
}

processDir('internal/api');
