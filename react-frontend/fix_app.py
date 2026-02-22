with open('src/App.jsx', 'r') as f:
    text = f.read()

# Instead of messing with parsing, let's just make the exact string replacements that fix it.
# The `roleMode === 'admin' && (` block should have ONE root element `<> ... </>` just in case, 
# but it already has `<div className="flex flex-col gap-6 h-full min-h-0">`.
# So we just need to ensure `flex flex-col gap-6` wraps both.

import re

# Find the end of Predictive Analytics
#    </div>
# </div>
# Then the logs start.
# If there is an extra `</div>` there, we remove it.

# Let's extract lines 313-322
lines = text.split('\n')

for i, l in enumerate(lines):
    if 'System Logs Panel' in l:
        logs_start = i
        break

# check lines before logs_start
count_divs = 0
for i in range(logs_start-1, logs_start-5, -1):
    if '</div>' in lines[i]:
        count_divs += 1

print(f"Divs before logs: {count_divs}")
# We want exactly 3 </div>s before System Logs. 
# One for `<div className="flex justify-between items-start mb-2">` which is already closed.
# Wait, let's look at the actual nesting.
"""
312:                                                 </div> // end div H (text-xs text-slate-400)
313:                                             </div> // end div F (p-3 bg-slate-800/50...)
314:                                         ))} 
315:                                     </div> // end div E (space-y-4 overflow-y-auto...)
316:                                 </div> // end div A (bg-slate-900 Analytics Top Half)
317:                             </div> // ERRONEOUS EXRTA DIV that closes `flex flex-col gap-6` !!
"""
# YES! If line 317 has `</div>` it closes `flex flex-col`! I must delete it.
# Let's write the fixed text by regex replacing:
# ``                                 </div>\n                            </div>\n\n                        {/* System Logs Panel - Expanded */}``
# with the fixed one.
fixed_text = re.sub(
    r'\s+</div>\n\s+</div>\n\s+\{/\* System Logs Panel',
    r'\n                                </div>\n\n                        {/* System Logs Panel',
    text
)

# And at the end, we need to correctly close the flex col, the conditional, and the grid.
# Find where System Logs ends:
fixed_text = re.sub(
    r'\s*\)\}\s*</div>\s*</div>\s*\)\}\s*</div>\s*\)\}\s*</main>',
    r'\n                                )}\n                            </div>\n                        </div>\n                        )}\n                        \n                    </div>\n                )}\n            </main>',
    fixed_text
)

with open('src/App.jsx', 'w') as f:
    f.write(fixed_text)

