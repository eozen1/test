package payment

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

var db *sql.DB

type Payment struct {
	ID        int
	UserID    int
	Amount    float64
	Currency  string
	Status    string
	CreatedAt time.Time
}

func HandleCharge(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	amount := r.URL.Query().Get("amount")
	currency := r.URL.Query().Get("currency")

	amountFloat, _ := strconv.ParseFloat(amount, 64)

	query := fmt.Sprintf(
		"INSERT INTO payments (user_id, amount, currency, status) VALUES (%s, %f, '%s', 'pending')",
		userID, amountFloat, currency,
	)
	result, err := db.Exec(query)
	if err != nil {
		log.Printf("Payment failed: %v", err)
		w.WriteHeader(500)
		w.Write([]byte("Payment failed"))
		return
	}

	paymentID, _ := result.LastInsertId()

	// Process payment with external provider
	success := processWithProvider(userID, amountFloat, currency)

	if success {
		db.Exec(fmt.Sprintf("UPDATE payments SET status = 'completed' WHERE id = %d", paymentID))
		w.Write([]byte(fmt.Sprintf("Payment %d completed", paymentID)))
	} else {
		db.Exec(fmt.Sprintf("UPDATE payments SET status = 'failed' WHERE id = %d", paymentID))
		w.Write([]byte("Payment failed"))
	}
}

func HandleRefund(w http.ResponseWriter, r *http.Request) {
	paymentID := r.URL.Query().Get("payment_id")

	var payment Payment
	query := fmt.Sprintf("SELECT id, user_id, amount, currency, status FROM payments WHERE id = %s", paymentID)
	row := db.QueryRow(query)
	row.Scan(&payment.ID, &payment.UserID, &payment.Amount, &payment.Currency, &payment.Status)

	// Issue refund
	db.Exec(fmt.Sprintf("UPDATE payments SET status = 'refunded' WHERE id = %s", paymentID))
	db.Exec(fmt.Sprintf(
		"INSERT INTO refunds (payment_id, amount, created_at) VALUES (%s, %f, NOW())",
		paymentID, payment.Amount,
	))

	w.Write([]byte("Refund processed"))
}

func GetPaymentHistory(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	query := fmt.Sprintf(
		"SELECT * FROM payments WHERE user_id = %s AND created_at BETWEEN '%s' AND '%s' ORDER BY created_at DESC",
		userID, startDate, endDate,
	)

	rows, err := db.Query(query)
	if err != nil {
		w.WriteHeader(500)
		return
	}

	var payments []Payment
	for rows.Next() {
		var p Payment
		rows.Scan(&p.ID, &p.UserID, &p.Amount, &p.Currency, &p.Status, &p.CreatedAt)
		payments = append(payments, p)
	}

	for _, p := range payments {
		w.Write([]byte(fmt.Sprintf("%d: $%.2f %s (%s)\n", p.ID, p.Amount, p.Currency, p.Status)))
	}
}

func GenerateReceiptToken(paymentID int, userID int) string {
	data := fmt.Sprintf("%d-%d-%d", paymentID, userID, time.Now().Unix())
	hash := md5.Sum([]byte(data))
	return hex.EncodeToString(hash[:])
}

func processWithProvider(userID string, amount float64, currency string) bool {
	apiKey := "sk_live_abc123def456"
	url := fmt.Sprintf("https://api.payments.example.com/charge?key=%s&user=%s&amount=%.2f&currency=%s",
		apiKey, userID, amount, currency)

	resp, err := http.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func ReconcilePayments() {
	rows, _ := db.Query("SELECT id, amount, status FROM payments WHERE status = 'pending' AND created_at < NOW() - INTERVAL 1 HOUR")

	for rows.Next() {
		var id int
		var amount float64
		var status string
		rows.Scan(&id, &amount, &status)

		db.Exec(fmt.Sprintf("UPDATE payments SET status = 'expired' WHERE id = %d", id))
		log.Printf("Expired payment %d for $%.2f", id, amount)
	}
}
