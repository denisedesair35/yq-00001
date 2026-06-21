import sqlite3
import os
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tool_share.db')

TOOL_CATEGORIES = ['电动工具', '手动工具', '户外露营', '清洁工具', '厨房用具', '园艺工具', '其他']

TOOL_STATUS = {'available': '可用', 'repairing': '维修中', 'offline': '已下架'}
BORROW_STATUS = {'pending': '待审核', 'approved': '已借出', 'rejected': '已拒绝', 'returned': '已归还', 'overdue': '已逾期'}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'resident',
        phone TEXT,
        created_at TEXT NOT NULL
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        max_days INTEGER NOT NULL,
        deposit REAL NOT NULL,
        location TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        owner_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id)
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS borrow_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_id INTEGER NOT NULL,
        borrower_id INTEGER NOT NULL,
        borrower_name TEXT NOT NULL,
        borrower_phone TEXT,
        borrow_time TEXT,
        expected_return_time TEXT,
        actual_return_time TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        apply_reason TEXT,
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tool_id) REFERENCES tools(id),
        FOREIGN KEY (borrower_id) REFERENCES users(id)
    )''')
    conn.commit()

    c.execute('SELECT COUNT(*) FROM users')
    if c.fetchone()[0] == 0:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        c.execute("INSERT INTO users (username, role, phone, created_at) VALUES (?, 'admin', ?, ?)",
                  ('管理员', '13800000000', now))
        c.execute("INSERT INTO users (username, role, phone, created_at) VALUES (?, 'resident', ?, ?)",
                  ('张三', '13800000001', now))
        c.execute("INSERT INTO users (username, role, phone, created_at) VALUES (?, 'resident', ?, ?)",
                  ('李四', '13800000002', now))
        conn.commit()
    conn.close()


def update_overdue_status():
    conn = get_db()
    c = conn.cursor()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    c.execute("""UPDATE borrow_records SET status = 'overdue'
                 WHERE status = 'approved' AND expected_return_time < ?""", (now,))
    conn.commit()
    conn.close()


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db()
    rows = conn.execute('SELECT * FROM users ORDER BY id').fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/api/users/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    if not username:
        return jsonify({'success': False, 'msg': '请输入用户名'}), 400
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    if not user:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cur = conn.cursor()
        cur.execute("INSERT INTO users (username, role, phone, created_at) VALUES (?, 'resident', ?, ?)",
                    (username, data.get('phone', ''), now))
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify({'success': True, 'user': row_to_dict(user)})


@app.route('/api/tools', methods=['GET'])
def list_tools():
    update_overdue_status()
    keyword = request.args.get('keyword', '').strip()
    category = request.args.get('category', '').strip()
    status = request.args.get('status', '').strip()

    sql = 'SELECT t.*, u.username as owner_real_name FROM tools t LEFT JOIN users u ON t.owner_id = u.id WHERE 1=1'
    params = []
    if keyword:
        sql += ' AND (t.name LIKE ? OR t.location LIKE ? OR t.description LIKE ?)'
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw])
    if category:
        sql += ' AND t.category = ?'
        params.append(category)
    if status:
        sql += ' AND t.status = ?'
        params.append(status)
    sql += ' ORDER BY t.id DESC'

    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/api/tools/<int:tool_id>', methods=['GET'])
def get_tool(tool_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM tools WHERE id = ?', (tool_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'success': False, 'msg': '工具不存在'}), 404
    return jsonify(row_to_dict(row))


@app.route('/api/tools', methods=['POST'])
def create_tool():
    data = request.json
    required = ['name', 'category', 'max_days', 'deposit', 'location', 'owner_id', 'owner_name']
    for f in required:
        if f not in data or data[f] in (None, ''):
            return jsonify({'success': False, 'msg': f'缺少字段: {f}'}), 400
    try:
        data['max_days'] = int(data['max_days'])
        data['deposit'] = float(data['deposit'])
    except ValueError:
        return jsonify({'success': False, 'msg': '天数或押金格式错误'}), 400

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''INSERT INTO tools
        (name, category, max_days, deposit, location, owner_id, owner_name, status, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)''',
        (data['name'], data['category'], data['max_days'], data['deposit'],
         data['location'], data['owner_id'], data['owner_name'],
         data.get('description', ''), now))
    conn.commit()
    tool_id = cur.lastrowid
    conn.close()
    return jsonify({'success': True, 'id': tool_id})


@app.route('/api/tools/<int:tool_id>/status', methods=['PUT'])
def update_tool_status(tool_id):
    data = request.json
    new_status = data.get('status', '')
    if new_status not in TOOL_STATUS:
        return jsonify({'success': False, 'msg': '无效状态'}), 400
    conn = get_db()
    tool = conn.execute('SELECT * FROM tools WHERE id = ?', (tool_id,)).fetchone()
    if not tool:
        conn.close()
        return jsonify({'success': False, 'msg': '工具不存在'}), 404
    conn.execute('UPDATE tools SET status = ? WHERE id = ?', (new_status, tool_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/borrows', methods=['GET'])
def list_borrows():
    update_overdue_status()
    status = request.args.get('status', '').strip()
    tool_id = request.args.get('tool_id')
    borrower_id = request.args.get('borrower_id')
    only_overdue = request.args.get('only_overdue', '0') == '1'

    sql = '''SELECT b.*, t.name as tool_name, t.category as tool_category,
             t.deposit as tool_deposit, t.max_days as tool_max_days,
             t.location as tool_location
             FROM borrow_records b LEFT JOIN tools t ON b.tool_id = t.id WHERE 1=1'''
    params = []
    if status:
        sql += ' AND b.status = ?'
        params.append(status)
    if tool_id:
        sql += ' AND b.tool_id = ?'
        params.append(int(tool_id))
    if borrower_id:
        sql += ' AND b.borrower_id = ?'
        params.append(int(borrower_id))
    if only_overdue:
        sql += " AND (b.status = 'overdue' OR (b.status = 'approved' AND b.expected_return_time < ?))"
        params.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    sql += ' ORDER BY b.id DESC'

    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    result = []
    now = datetime.now()
    for r in rows:
        d = row_to_dict(r)
        if d['expected_return_time'] and d['status'] in ('approved', 'overdue'):
            exp = datetime.strptime(d['expected_return_time'], '%Y-%m-%d %H:%M:%S')
            d['overdue_days'] = max(0, (now - exp).days)
        else:
            d['overdue_days'] = 0
        result.append(d)
    conn.close()
    return jsonify(result)


@app.route('/api/borrows', methods=['POST'])
def create_borrow():
    data = request.json
    required = ['tool_id', 'borrower_id', 'borrower_name']
    for f in required:
        if f not in data or data[f] in (None, ''):
            return jsonify({'success': False, 'msg': f'缺少字段: {f}'}), 400

    conn = get_db()
    tool = conn.execute('SELECT * FROM tools WHERE id = ?', (data['tool_id'],)).fetchone()
    if not tool:
        conn.close()
        return jsonify({'success': False, 'msg': '工具不存在'}), 404
    if tool['status'] != 'available':
        conn.close()
        return jsonify({'success': False, 'msg': f'工具当前状态: {TOOL_STATUS.get(tool["status"])}, 不可借用'}), 400

    pending = conn.execute("""SELECT COUNT(*) as cnt FROM borrow_records
        WHERE tool_id = ? AND status = 'pending'""", (data['tool_id'],)).fetchone()
    if pending['cnt'] > 0:
        conn.close()
        return jsonify({'success': False, 'msg': '已有待审核的申请'}), 400

    approved = conn.execute("""SELECT COUNT(*) as cnt FROM borrow_records
        WHERE tool_id = ? AND status IN ('approved', 'overdue')""", (data['tool_id'],)).fetchone()
    if approved['cnt'] > 0:
        conn.close()
        return jsonify({'success': False, 'msg': '该工具已被借出'}), 400

    now = datetime.now()
    expected = now + timedelta(days=int(tool['max_days']))
    cur = conn.cursor()
    cur.execute('''INSERT INTO borrow_records
        (tool_id, borrower_id, borrower_name, borrower_phone, apply_reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)''',
        (data['tool_id'], data['borrower_id'], data['borrower_name'],
         data.get('borrower_phone', ''), data.get('apply_reason', ''),
         now.strftime('%Y-%m-%d %H:%M:%S')))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({'success': True, 'id': new_id})


@app.route('/api/borrows/<int:record_id>/approve', methods=['POST'])
def approve_borrow(record_id):
    data = request.json
    days = int(data.get('days', 0))
    conn = get_db()
    record = conn.execute('SELECT * FROM borrow_records WHERE id = ?', (record_id,)).fetchone()
    if not record:
        conn.close()
        return jsonify({'success': False, 'msg': '记录不存在'}), 404
    if record['status'] != 'pending':
        conn.close()
        return jsonify({'success': False, 'msg': '当前状态不可审核'}), 400

    tool = conn.execute('SELECT * FROM tools WHERE id = ?', (record['tool_id'],)).fetchone()
    if not tool or tool['status'] != 'available':
        conn.close()
        return jsonify({'success': False, 'msg': '工具状态不可借'}), 400

    now = datetime.now()
    if days <= 0:
        days = tool['max_days']
    expected = now + timedelta(days=days)

    conn.execute('''UPDATE borrow_records
        SET status = 'approved', borrow_time = ?, expected_return_time = ?
        WHERE id = ?''',
        (now.strftime('%Y-%m-%d %H:%M:%S'), expected.strftime('%Y-%m-%d %H:%M:%S'), record_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/borrows/<int:record_id>/reject', methods=['POST'])
def reject_borrow(record_id):
    data = request.json
    reason = data.get('reason', '')
    conn = get_db()
    record = conn.execute('SELECT * FROM borrow_records WHERE id = ?', (record_id,)).fetchone()
    if not record:
        conn.close()
        return jsonify({'success': False, 'msg': '记录不存在'}), 404
    if record['status'] != 'pending':
        conn.close()
        return jsonify({'success': False, 'msg': '当前状态不可拒绝'}), 400
    conn.execute('UPDATE borrow_records SET status = ?, reject_reason = ? WHERE id = ?',
                 ('rejected', reason, record_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/borrows/<int:record_id>/return', methods=['POST'])
def return_borrow(record_id):
    conn = get_db()
    record = conn.execute('SELECT * FROM borrow_records WHERE id = ?', (record_id,)).fetchone()
    if not record:
        conn.close()
        return jsonify({'success': False, 'msg': '记录不存在'}), 404
    if record['status'] not in ('approved', 'overdue'):
        conn.close()
        return jsonify({'success': False, 'msg': '当前状态不可归还'}), 400
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute('UPDATE borrow_records SET status = ?, actual_return_time = ? WHERE id = ?',
                 ('returned', now, record_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    update_overdue_status()
    conn = get_db()
    result = {
        'tool_total': conn.execute('SELECT COUNT(*) FROM tools').fetchone()[0],
        'tool_available': conn.execute("SELECT COUNT(*) FROM tools WHERE status = 'available'").fetchone()[0],
        'tool_repairing': conn.execute("SELECT COUNT(*) FROM tools WHERE status = 'repairing'").fetchone()[0],
        'tool_offline': conn.execute("SELECT COUNT(*) FROM tools WHERE status = 'offline'").fetchone()[0],
        'borrow_pending': conn.execute("SELECT COUNT(*) FROM borrow_records WHERE status = 'pending'").fetchone()[0],
        'borrow_approved': conn.execute("SELECT COUNT(*) FROM borrow_records WHERE status = 'approved'").fetchone()[0],
        'borrow_overdue': conn.execute("SELECT COUNT(*) FROM borrow_records WHERE status = 'overdue'").fetchone()[0],
        'borrow_returned': conn.execute("SELECT COUNT(*) FROM borrow_records WHERE status = 'returned'").fetchone()[0],
        'user_total': conn.execute('SELECT COUNT(*) FROM users').fetchone()[0],
    }
    conn.close()
    return jsonify(result)


@app.route('/api/categories', methods=['GET'])
def get_categories():
    return jsonify(TOOL_CATEGORIES)


@app.route('/api/status-map', methods=['GET'])
def get_status_map():
    return jsonify({'tool': TOOL_STATUS, 'borrow': BORROW_STATUS})


if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5001, debug=True)
