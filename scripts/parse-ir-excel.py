import os
import zipfile
import xml.etree.ElementTree as ET

excel_path = os.path.join(os.path.dirname(__file__), '..', 'ir_export_sample.xlsx')

with zipfile.ZipFile(excel_path, 'r') as z:
    wb_xml = z.read('xl/workbook.xml')
    print("--- workbook.xml ---")
    print(wb_xml.decode('utf8'))

    sheet_xml = z.read('xl/worksheets/sheet1.xml')
    root = ET.fromstring(sheet_xml)
    rows = []
    for r in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
        t_nodes = [t.text for t in r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text]
        if t_nodes:
            rows.append(t_nodes)

    print("\n--- SAMPLE ROWS EXTRACTED ---")
    for idx, r in enumerate(rows[:15]):
        print(f"Row {idx+1}: {r}")
