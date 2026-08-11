import re, zlib, sys
with open('uploads/spmb/SAMPLE-REG-20260809-006.pdf', 'rb') as f:
    data = f.read()

# Find each "X 0 obj << ... stream\n..." block by walking objects
text = data
i = 0
idx = 0
while True:
    m = re.search(rb'(\d+) 0 obj <<', text[i:])
    if not m:
        break
    o_num = m.group(1).decode()
    abs_start = i + m.end()
    # Read until "stream" followed by newline
    sn = text.find(b'stream', abs_start)
    if sn == -1:
        break
    # CR or LF after stream?
    end_header = sn + 6
    # Find 'endstream'
    en = text.find(b'endstream', end_header)
    # Compressed or raw?
    blob = text[end_header:en].rstrip(b'\r\n')
    # Try to find /Length
    head = text[abs_start:sn].decode('latin-1', errors='ignore')
    length_match = re.search(r'/Length\s+(\d+)', head)
    print(f'\n=== Object {o_num} (header: {head.strip()[:200]}) ===')
    try:
        decoded = zlib.decompress(blob).decode('latin-1', errors='ignore')
        print(f'  raw {len(blob)}B -> decoded {len(decoded)}B')
        print('  ' + decoded[:600].replace('\n', ' '))
    except Exception as e:
        print(f'  raw {len(blob)}B (no zlib): {blob[:300]}')
    i = en + 9
    idx += 1
    if idx > 30:
        break