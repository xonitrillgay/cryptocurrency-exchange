use actix_web::{HttpResponse, Responder, get, web};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::env;

/// Structure to represent CoinMarketCap API response
#[derive(Deserialize, Debug)]
pub struct CoinMarketCapResponse {
    status: Status,
    data: Vec<CryptoCurrency>,
}

#[derive(Deserialize, Debug)]
pub struct Status {
    timestamp: String,
    error_code: i32,
    error_message: Option<String>,
    elapsed: i32,
    credit_count: i32,
}

#[derive(Deserialize, Debug)]
pub struct CryptoCurrency {
    id: i32,
    name: String,
    symbol: String,
    slug: String,
    cmc_rank: i32,
    quote: Quote,
}

#[derive(Deserialize, Debug)]
pub struct Quote {
    USD: UsdQuote,
}

#[derive(Deserialize, Debug)]
pub struct UsdQuote {
    price: f64,
    volume_24h: f64,
    percent_change_1h: f64,
    percent_change_24h: f64,
    percent_change_7d: f64,
    market_cap: f64,
    last_updated: String,
}

/// Structure for our API response
#[derive(Serialize)]
pub struct MarketsResponse {
    cryptocurrencies: Vec<CryptoCurrencyResponse>,
    last_updated: String,
}

#[derive(Serialize)]
pub struct CryptoCurrencyResponse {
    id: i32,
    name: String,
    symbol: String,
    price: f64,
    market_cap: f64,
    volume_24h: f64,
    percent_change_1h: f64,
    percent_change_24h: f64,
    percent_change_7d: f64,
}

/// Fetches the latest cryptocurrency listings from CoinMarketCap
///
/// This endpoint retrieves cryptocurrency data from CoinMarketCap's API
/// using the API key stored in the environment variables. It formats the
/// data for the frontend to display in the markets table.
///
/// # Returns
/// A JSON response with an array of cryptocurrencies and their market data
#[get("/api/markets")]
pub async fn get_markets() -> impl Responder {
    // Get API key from environment variables
    let api_key = match env::var("COINMARKETCAP_API_KEY") {
        Ok(key) => key,
        Err(_) => {
            error!("COINMARKETCAP_API_KEY not found in environment variables");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "API key configuration error"
            }));
        }
    };

    // Create client with API key header
    let client = reqwest::Client::new();

    // Make API request to CoinMarketCap
    let response = match client
        .get("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest")
        .query(&[("limit", "100"), ("convert", "USD")])
        .header("X-CMC_PRO_API_KEY", api_key)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            error!("Failed to fetch data from CoinMarketCap API: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch cryptocurrency data"
            }));
        }
    };

    // Check if response is successful
    if !response.status().is_success() {
        let status = response.status();
        error!("CoinMarketCap API returned error status: {}", status);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("API returned error status: {}", status)
        }));
    }

    // Parse the response
    match response.json::<CoinMarketCapResponse>().await {
        Ok(cmc_data) => {
            info!(
                "Successfully fetched data for {} cryptocurrencies",
                cmc_data.data.len()
            );

            // Transform the data for frontend
            let cryptocurrencies = cmc_data
                .data
                .iter()
                .map(|crypto| CryptoCurrencyResponse {
                    id: crypto.id,
                    name: crypto.name.clone(),
                    symbol: crypto.symbol.clone(),
                    price: crypto.quote.USD.price,
                    market_cap: crypto.quote.USD.market_cap,
                    volume_24h: crypto.quote.USD.volume_24h,
                    percent_change_1h: crypto.quote.USD.percent_change_1h,
                    percent_change_24h: crypto.quote.USD.percent_change_24h,
                    percent_change_7d: crypto.quote.USD.percent_change_7d,
                })
                .collect();

            // Return successful response
            HttpResponse::Ok().json(MarketsResponse {
                cryptocurrencies,
                last_updated: cmc_data.status.timestamp,
            })
        }
        Err(e) => {
            error!("Failed to parse CoinMarketCap API response: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to parse cryptocurrency data"
            }))
        }
    }
}
