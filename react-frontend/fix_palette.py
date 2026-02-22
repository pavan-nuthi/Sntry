import os
import re

dir_path = "src"

replacements = [
    (r"bg-\[\#0E1117\]", "bg-warm-50"),
    (r"bg-slate-900", "bg-warm-100"),
    (r"bg-slate-800", "bg-warm-200"),
    (r"bg-slate-700", "bg-warm-300"),
    (r"border-slate-800", "border-warm-300"),
    (r"border-slate-700", "border-warm-400"),
    (r"text-slate-200", "text-warm-900"),
    (r"text-slate-300", "text-warm-800"),
    (r"text-slate-400", "text-warm-600"),
    (r"text-slate-500", "text-warm-500"),
    (r"bg-emerald-500", "bg-peach-400"),
    (r"bg-emerald-600", "bg-peach-500"),
    (r"text-emerald-400", "text-peach-600"),
    (r"border-emerald-500", "border-peach-400"),
    (r"shadow-emerald-500", "shadow-peach-400"),
    (r"bg-emerald-600/30", "bg-peach-400/30"),
    (r"border-emerald-500/50", "border-peach-400/50"),
    (r"shadow-emerald-500/20", "shadow-peach-400/20")
]

def process_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()
    
    original = content
    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content)
        
    # Careful replacement of text-white. If it's a heading or text inside a dark panel, turning it to warm-900
    # But for badges/buttons like text-white on red/peach backgrounds, keep it.
    # Let's just blindly replace text-white with text-warm-900, EXCEPT if bg-peach or bg-rose or bg-indigo is in the same line?
    # Simple heuristic:
    new_lines = []
    for line in content.split('\n'):
        if 'text-white' in line:
            if 'bg-peach' not in line and 'bg-rose' not in line and 'bg-indigo' not in line and 'bg-emerald' not in line and 'text-xs font-bold' not in line and 'bg-blue' not in line:
                line = line.replace('text-white', 'text-warm-900')
        new_lines.append(line)
        
    content = '\n'.join(new_lines)
    
    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk(dir_path):
    for file in files:
        if file.endswith(".jsx") or file.endswith(".css"):
            process_file(os.path.join(root, file))

