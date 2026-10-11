PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "forecasts" (
	"forecast_id"	INTEGER,
	"product_id"	INTEGER NOT NULL,
	"forecast_date"	DATE NOT NULL,
	"horizon_days"	INTEGER DEFAULT 7,
	"predicted_qty"	REAL NOT NULL,
	"model_name"	TEXT,
	PRIMARY KEY("forecast_id" AUTOINCREMENT),
	FOREIGN KEY("product_id") REFERENCES "products"("product_id")
);
CREATE TABLE IF NOT EXISTS "inventory" (
	"inventory_id"	INTEGER,
	"product_id"	INTEGER NOT NULL UNIQUE,
	"current_stock"	INTEGER DEFAULT 0,
	"minimum_stock"	INTEGER DEFAULT 0,
	"last_updated"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("inventory_id" AUTOINCREMENT),
	FOREIGN KEY("product_id") REFERENCES "products"("product_id")
);
CREATE TABLE IF NOT EXISTS "model_metrics" (
	"metric_id"	INTEGER,
	"model_name"	TEXT,
	"mae"	REAL,
	"rmse"	REAL,
	"mase"	REAL,
	"evaluated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("metric_id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "products" (
	"product_id"	INTEGER,
	"sku"	TEXT NOT NULL UNIQUE,
	"name"	TEXT NOT NULL,
	"category"	TEXT,
	"unit_price"	REAL DEFAULT 0,
	"minimum_stock"	INTEGER DEFAULT 0,
	"is_active"	INTEGER DEFAULT 1,
	"eligible"	INTEGER DEFAULT 0,
	PRIMARY KEY("product_id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "reorder_recommendations" (
	"recommendation_id"	INTEGER,
	"product_id"	INTEGER NOT NULL,
	"forecast_id"	INTEGER,
	"current_stock"	INTEGER,
	"minimum_stock"	INTEGER,
	"required_stock"	INTEGER,
	"reorder_qty"	INTEGER,
	"status"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("recommendation_id" AUTOINCREMENT),
	FOREIGN KEY("forecast_id") REFERENCES "forecasts"("forecast_id"),
	FOREIGN KEY("product_id") REFERENCES "products"("product_id")
);
CREATE TABLE IF NOT EXISTS "sales" (
	"sale_id"	INTEGER,
	"product_id"	INTEGER NOT NULL,
	"sale_date"	DATE NOT NULL,
	"quantity"	INTEGER NOT NULL,
	"unit_price"	REAL DEFAULT 0,
	"source"	TEXT DEFAULT 'Manual',
	PRIMARY KEY("sale_id" AUTOINCREMENT),
	FOREIGN KEY("product_id") REFERENCES "products"("product_id")
);
CREATE TABLE IF NOT EXISTS "stock_movements" (
	"movement_id"	INTEGER,
	"product_id"	INTEGER NOT NULL,
	"movement_type"	TEXT,
	"quantity"	INTEGER,
	"previous_stock"	INTEGER,
	"new_stock"	INTEGER,
	"notes"	TEXT,
	"user_name"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("movement_id" AUTOINCREMENT),
	FOREIGN KEY("product_id") REFERENCES "products"("product_id")
);
CREATE TABLE IF NOT EXISTS "users" (
	"user_id"	INTEGER,
	"full_name"	TEXT NOT NULL,
	"email"	TEXT NOT NULL UNIQUE,
	"password_hash"	TEXT NOT NULL,
	"role"	TEXT DEFAULT 'manager',
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("user_id" AUTOINCREMENT)
);