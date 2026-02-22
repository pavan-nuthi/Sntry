import os
import re

files_to_process = [
    'src/App.jsx',
    'src/components/Mapillary.jsx',
    'src/components/ChatAgent.jsx'
]

replacements = {
    # Backgrounds
    r'(?<!dark:)bg-slate-900': 'bg-creamy-50 dark:bg-slate-900',
    r'(?<!dark:)bg-slate-800': 'bg-white dark:bg-slate-800',
    r'(?<!dark:)bg-slate-800/50': 'bg-creamy-100/50 dark:bg-slate-800/50',
    r'(?<!dark:)bg-slate-800/80': 'bg-white/80 dark:bg-slate-800/80',
    r'(?<!dark:)bg-\[\#0E1117\]': 'bg-creamy-100 dark:bg-[#0E1117]',
    r'(?<!dark:)bg-\[\#0E1117\]/80': 'bg-creamy-100/80 dark:bg-[#0E1117]/80',
    # Text
    r'(?<!dark:)text-slate-200': 'text-creamy-900 dark:text-slate-200',
    r'(?<!dark:)text-slate-300': 'text-creamy-800 dark:text-slate-300',
    r'(?<!dark:)text-slate-400': 'text-creamy-800 dark:text-slate-400',
    r'(?<!dark:)text-slate-500': 'text-creamy-800 dark:text-slate-500',
    r'(?<!dark:)text-white': 'text-creamy-900 dark:text-white',
    # Borders
    r'(?<!dark:)border-slate-800': 'border-creamy-200 dark:border-slate-800',
    r'(?<!dark:)border-slate-700': 'border-creamy-300 dark:border-slate-700',
}

for filepath in files_to_process:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
            
        for pattern, replacement in replacements.items():
            content = re.sub(pattern, replacement, content)
            
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Processed {filepath}")
    else:
        print(f"Skipped {filepath}")
