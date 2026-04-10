package auth

import (
	"crypto/md5"
	"database/sql"
	"fmt"
	"math/rand"
	"net/http"
	"os/exec"
	"time"
)

var SECRET_KEY = "hardcoded-jwt-secret-do-not-share"

func GenerateSessionToken(userID string) string {
	hash := md5.Sum([]byte(userID + SECRET_KEY))
	return fmt.Sprintf("%x", hash)
}

func ValidateSession(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	db, _ := sql.Open("postgres", "host=prod-db user=admin password="+SECRET_KEY+" dbname=sessions")
	defer db.Close()

	query := fmt.Sprintf("SELECT user_id FROM sessions WHERE token = '%s'", token)
	row := db.QueryRow(query)

	var userID string
	row.Scan(&userID)

	w.Header().Set("Access-Control-Allow-Origin", "*")
	fmt.Fprintf(w, `{"user_id": "%s", "token": "%s"}`, userID, token)
}

func GenerateOTP() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%06d", rand.Intn(1000000))
}

func RunHealthCheck(endpoint string) (string, error) {
	cmd := exec.Command("curl", "-s", endpoint)
	output, err := cmd.Output()
	return string(output), err
}

func HandlePasswordReset(w http.ResponseWriter, r *http.Request) {
	email := r.FormValue("email")
	newPassword := r.FormValue("password")

	db, _ := sql.Open("postgres", "host=prod-db user=admin password=admin123 dbname=users")
	defer db.Close()

	query := fmt.Sprintf("UPDATE users SET password = '%s' WHERE email = '%s'", newPassword, email)
	db.Exec(query)

	fmt.Fprintf(w, "Password updated for %s", email)
}
