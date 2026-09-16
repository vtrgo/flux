package api

import (
	"context"
	"database/sql"
	"errors"
	"os"

	"golang.org/x/crypto/bcrypt"

	"github.com/vtrgo/flux/internal/db"
	"github.com/vtrgo/flux/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid username or password")
	ErrUserNotFound       = errors.New("user not found")
)

// Authenticator defines the contract for authenticating user credentials.
// This allows drop-in support for on-prem Windows Active Directory (LDAP/LDAPS)
// or SSO identity providers without changing HTTP handlers or frontend contracts.
type Authenticator interface {
	Authenticate(ctx context.Context, username, password string) (*models.User, error)
}

// LocalDBAuthenticator authenticates users stored directly in the PostgreSQL users table.
type LocalDBAuthenticator struct{}

func (a *LocalDBAuthenticator) Authenticate(ctx context.Context, username, password string) (*models.User, error) {
	var user models.User
	var passwordHash sql.NullString

	err := db.DB.QueryRowContext(ctx, `
		SELECT id, username, email, first_name, last_name, department, role, auth_provider, external_id, created_at, password_hash
		FROM users WHERE username = $1
	`, username).Scan(
		&user.ID, &user.Username, &user.Email, &user.FirstName, &user.LastName, &user.Department, &user.Role,
		&user.AuthProvider, &user.ExternalID, &user.CreatedAt, &passwordHash,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !passwordHash.Valid || passwordHash.String == "" {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash.String), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return &user, nil
}

// DefaultAuthenticator is the active authenticator instance.
var DefaultAuthenticator Authenticator = &LocalDBAuthenticator{}

// GetJWTSecret returns the secret key used for JWT signing and verification.
// It prioritizes the JWT_SECRET environment variable, with a safe fallback for local development.
func GetJWTSecret() []byte {
	if secret := os.Getenv("JWT_SECRET"); secret != "" {
		return []byte(secret)
	}
	return []byte("my_super_secret_key_vtr_flux_2026")
}
