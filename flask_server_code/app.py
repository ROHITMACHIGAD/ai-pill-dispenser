# Add this to your imports at the top
from flask import Flask, jsonify, request  # Added 'request' here

from flask_cors import CORS
import psycopg2
from psycopg2 import OperationalError
from datetime import time
from datetime import datetime
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def get_db_connection():
    return psycopg2.connect(
        host="localhost",
        database="medtracker",
        user="postgres",
        password="",
        port="5432"
    )


@app.route('/api/bpm', methods=['POST'])
def add_bpm():
    """Add BPM reading to database"""
    data = request.get_json()
    bpm_value = data.get('bpm')

    if not isinstance(bpm_value, int) or not (30 <= bpm_value <= 220):
        return jsonify({'error': 'Invalid BPM value (must be integer between 30-220)'}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO bpm (bpm, recorded_at) VALUES (%s, %s)',
            (bpm_value, datetime.now())
        )
        conn.commit()
        return jsonify({'message': 'BPM recorded successfully'}), 201
    except OperationalError as e:
        conn.rollback()
        return jsonify({'error': f'Database error: {e}'}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route('/api/dispense', methods=['POST'])
def record_dispense():
    data = request.get_json()
    pill = data.get('pill', '').lower()

    if pill not in ['a', 'b']:
        return jsonify({'error': 'Invalid pill. Use "a" or "b"'}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # UPSERT operation with proper defaults
        cur.execute(f'''
            INSERT INTO attendance (recorded_date, pill_a, pill_b)
            VALUES (
                CURRENT_DATE,
                {'TRUE' if pill == 'a' else 'FALSE'},
                {'TRUE' if pill == 'b' else 'FALSE'}
            )
            ON CONFLICT (recorded_date) DO UPDATE SET
                pill_{pill} = TRUE
        ''')

        # Update medication count
        cur.execute('''
            UPDATE medications
            SET cnt_b = GREATEST(cnt_b - 1, 0)
            WHERE name = %s
        ''', (pill.upper(),))

        conn.commit()
        return jsonify({'message': f'Pill {pill.upper()} dispensed'}), 200

    except Exception as e:
        conn.rollback()
        print(f"Database Error: {str(e)}")  # Add logging
        return jsonify({'error': f"Server error: {str(e)}"}), 500
    finally:
        if conn: conn.close()



@app.route('/api/medications/reset', methods=['POST'])
def reset_counts():
    """Reset medication counts (optional maintenance endpoint)"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            UPDATE medications 
            SET cnt_a = quantity, cnt_b = quantity
        ''')
        conn.commit()
        return jsonify({'message': 'Medication counts reset successfully'}), 200
    except OperationalError as e:
        conn.rollback()
        return jsonify({'error': f'Database error: {e}'}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()







@app.route('/api/pills', methods=['GET'])
def get_pills():
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Updated query to include count fields
        cur.execute('''
            SELECT name, time, quantity, cnt_a, cnt_b 
            FROM medications
            ORDER BY created_at DESC
        ''')

        data = cur.fetchall()
        processed_data = []

        for row in data:
            # Convert time object to string
            time_str = row[1].strftime('%H:%M') if isinstance(row[1], time) else str(row[1])

            processed_data.append({
                'pill': row[0],
                'time': time_str,
                'quantity': row[2],
                'count_a': row[3],  # Added count_a
                'count_b': row[4]  # Added count_b
            })

        return jsonify(processed_data)

    except OperationalError as e:
        return jsonify({'error': f'Database connection failed: {e}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'database': 'medications'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
