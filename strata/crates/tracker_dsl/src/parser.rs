//! Hand-rolled parser + lowering for tracker DSL.

use crate::ast::TrackerAst;
use tracker_ir::error::{ErrorCode, TrackerError, TrackerResult};
use tracker_ir::{
    AggregationDefinition, AggregationFunc, AlertDefinition, BinaryOperator, ComparisonOperator,
    Condition, DeriveDefinition, Expression, FieldDefinition, FieldType, GroupByDimension,
    MetricDefinition, PlanningDefinition, PlanningStrategyDefinition, TimeGrain, TrackerVersion,
    ViewDefinition,
};

pub fn parse_tracker(input: &str) -> TrackerResult<TrackerAst> {
    let src = strip_comments(input);
    let tracker_start = src
        .find("tracker")
        .ok_or_else(|| parse_error("missing tracker declaration"))?;
    let src = src[tracker_start..].trim();

    let body_start = src
        .find('{')
        .ok_or_else(|| parse_error("tracker body must start with '{'"))?;
    let header = src[..body_start].trim();
    let body = extract_braced(src, body_start)?.trim();

    let (name, version) = parse_header(header)?;

    let fields = parse_fields(section_body(body, "fields")?)?;
    let derives = parse_derives(section_body_optional(body, "derive"))?;
    let metrics = parse_metrics(section_body_optional(body, "metrics"))?;
    let alerts = parse_alerts(section_body_optional(body, "alerts"))?;
    let planning = parse_planning(section_body_optional(body, "planning"))?;
    let views = parse_views(section_body_optional(body, "views"))?;

    Ok(TrackerAst {
        name,
        version,
        fields,
        derives,
        metrics,
        alerts,
        planning,
        views,
    })
}

fn parse_header(header: &str) -> TrackerResult<(String, TrackerVersion)> {
    let mut lexer = HeaderLexer::new(header);
    let tracker_kw = lexer
        .next_token()
        .ok_or_else(|| parse_error("missing 'tracker' keyword"))?;
    if tracker_kw != "tracker" {
        return Err(parse_error("declaration must start with 'tracker' keyword"));
    }

    let raw_name = lexer
        .next_token()
        .ok_or_else(|| parse_error("tracker name is required"))?;
    let name = unquote(&raw_name);

    let version = lexer
        .next_token()
        .map(|raw| parse_version(&raw))
        .transpose()?
        .unwrap_or_default();

    Ok((name, version))
}

fn parse_fields(body: &str) -> TrackerResult<Vec<FieldDefinition>> {
    let mut fields = Vec::new();
    for (line_index, line) in statement_lines(body).into_iter().enumerate() {
        let Some((name, rest)) = line.split_once(':') else {
            return Err(parse_error_at_line(
                format!("invalid field definition: {line}"),
                line_index + 1,
                &line,
            ));
        };
        let name = name.trim().to_string();
        let rest = rest.trim().to_string();

        let mut default_value = None;
        let type_expr = if let Some((lhs, rhs)) = rest.split_once('=') {
            default_value = Some(parse_literal(rhs.trim())?);
            lhs.trim().to_string()
        } else {
            rest
        };

        let optional = type_expr
            .split_whitespace()
            .any(|token| token == "optional");
        let field_type = parse_field_type(&type_expr.replace(" optional", ""))?;

        fields.push(FieldDefinition {
            name,
            field_type,
            optional,
            default_value,
        });
    }
    Ok(fields)
}

fn parse_derives(body: Option<&str>) -> TrackerResult<Vec<DeriveDefinition>> {
    let Some(body) = body else {
        return Ok(Vec::new());
    };
    let mut derives = Vec::new();
    for (line_index, line) in statement_lines(body).into_iter().enumerate() {
        let Some((name, expr)) = line.split_once('=') else {
            return Err(parse_error_at_line(
                format!("invalid derive definition: {line}"),
                line_index + 1,
                &line,
            ));
        };
        derives.push(DeriveDefinition {
            name: name.trim().to_string(),
            expr: parse_expression(expr.trim())?,
        });
    }
    Ok(derives)
}

fn parse_metrics(body: Option<&str>) -> TrackerResult<Vec<MetricDefinition>> {
    let Some(body) = body else {
        return Ok(Vec::new());
    };

    let mut metrics = Vec::new();
    for (line_index, line) in statement_lines(body).into_iter().enumerate() {
        let Some((name, rhs)) = line.split_once('=') else {
            return Err(parse_error_at_line(
                format!("invalid metric definition: {line}"),
                line_index + 1,
                &line,
            ));
        };
        let aggregation = parse_aggregation(rhs.trim())?;
        metrics.push(MetricDefinition {
            name: name.trim().to_string(),
            aggregation,
        });
    }
    Ok(metrics)
}

fn parse_alerts(body: Option<&str>) -> TrackerResult<Vec<AlertDefinition>> {
    let Some(body) = body else {
        return Ok(Vec::new());
    };

    let mut alerts = Vec::new();
    for (line_index, line) in statement_lines(body).into_iter().enumerate() {
        let Some((name, expr)) = line.split_once('=') else {
            return Err(parse_error_at_line(
                format!("invalid alert definition: {line}"),
                line_index + 1,
                &line,
            ));
        };
        alerts.push(AlertDefinition {
            name: name.trim().to_string(),
            expr: parse_expression(expr.trim())?,
        });
    }
    Ok(alerts)
}

fn parse_planning(body: Option<&str>) -> TrackerResult<Option<PlanningDefinition>> {
    let Some(body) = body else {
        return Ok(None);
    };

    let mut offset = 0usize;
    let mut strategies = Vec::new();
    while let Some(idx) = find_keyword(&body[offset..], "strategy") {
        let absolute = offset + idx;
        let remainder = body[absolute..].trim_start();

        let strategy_kw_len = "strategy".len();
        let after_kw = remainder[strategy_kw_len..].trim_start();
        let brace_idx = after_kw
            .find('{')
            .ok_or_else(|| parse_error("planning strategy missing body"))?;
        let raw_name = after_kw[..brace_idx].trim();
        let strategy_name = unquote(raw_name);

        let block = extract_braced(after_kw, brace_idx)?;
        let mut params = std::collections::BTreeMap::new();
        for (line_index, line) in statement_lines(block).into_iter().enumerate() {
            if let Some((key, value)) = line.split_once('=') {
                params.insert(key.trim().to_string(), parse_literal(value.trim())?);
            } else {
                return Err(parse_error_at_line(
                    format!("invalid planning strategy parameter: {line}"),
                    line_index + 1,
                    &line,
                ));
            }
        }

        strategies.push(PlanningStrategyDefinition {
            name: strategy_name,
            params,
        });

        let consumed = remainder
            .find(&format!("{{{}}}", block))
            .map(|start| start + block.len() + 2)
            .unwrap_or(remainder.len());
        offset = absolute + consumed;
    }

    Ok(Some(PlanningDefinition { strategies }))
}

fn parse_views(body: Option<&str>) -> TrackerResult<Vec<ViewDefinition>> {
    let Some(body) = body else {
        return Ok(Vec::new());
    };

    let mut offset = 0usize;
    let mut views = Vec::new();
    while let Some(idx) = find_keyword(&body[offset..], "view") {
        let absolute = offset + idx;
        let remainder = body[absolute..].trim_start();

        let view_kw_len = "view".len();
        let after_kw = remainder[view_kw_len..].trim_start();
        let brace_idx = after_kw
            .find('{')
            .ok_or_else(|| parse_error("view definition missing body"))?;
        let raw_name = after_kw[..brace_idx].trim();
        let view_name = unquote(raw_name);

        let block = extract_braced(after_kw, brace_idx)?;
        let mut params = std::collections::BTreeMap::new();
        for (line_index, line) in statement_lines(block).into_iter().enumerate() {
            if let Some((key, value)) = line.split_once('=') {
                params.insert(key.trim().to_string(), parse_literal(value.trim())?);
            } else {
                return Err(parse_error_at_line(
                    format!("invalid view parameter: {line}"),
                    line_index + 1,
                    &line,
                ));
            }
        }

        views.push(ViewDefinition {
            name: view_name,
            params,
        });

        let consumed = remainder
            .find(&format!("{{{}}}", block))
            .map(|start| start + block.len() + 2)
            .unwrap_or(remainder.len());
        offset = absolute + consumed;
    }

    Ok(views)
}

fn parse_aggregation(rhs: &str) -> TrackerResult<AggregationDefinition> {
    let func_end = rhs
        .find('(')
        .ok_or_else(|| parse_error(format!("aggregation missing '(': {rhs}")))?;
    let func = parse_aggregation_func(rhs[..func_end].trim())?;
    let target_body = extract_braced_like(rhs, func_end, '(', ')')?;
    let mut tail = rhs[(func_end + target_body.len() + 2)..].trim();

    let target = if target_body.trim().is_empty() {
        None
    } else {
        Some(parse_expression(target_body.trim())?)
    };

    let mut group_by = Vec::new();
    let mut over = None;

    if tail.starts_with("by") {
        tail = tail[2..].trim();
        let mut end = tail.len();
        if let Some(idx) = tail.find(" over ") {
            end = idx;
        }
        let by_part = tail[..end].trim();
        for raw in by_part.split(',') {
            let name = raw.trim();
            if name.is_empty() {
                continue;
            }
            group_by.push(GroupByDimension::Field(name.to_string()));
        }
        tail = tail[end..].trim();
    }

    if let Some(grain) = tail.strip_prefix("over") {
        let grain = grain.trim();
        over = Some(parse_time_grain(grain)?);
    }

    Ok(AggregationDefinition {
        func,
        target,
        group_by,
        over,
    })
}

fn parse_aggregation_func(raw: &str) -> TrackerResult<AggregationFunc> {
    match raw {
        "sum" => Ok(AggregationFunc::Sum),
        "max" => Ok(AggregationFunc::Max),
        "min" => Ok(AggregationFunc::Min),
        "avg" => Ok(AggregationFunc::Avg),
        "count" => Ok(AggregationFunc::Count),
        other => Err(parse_error(format!(
            "unsupported aggregation function: {other}"
        ))),
    }
}

fn parse_field_type(raw: &str) -> TrackerResult<FieldType> {
    let raw = raw.trim();
    if raw.starts_with("enum(") {
        let args = extract_braced_like(raw, raw.find('(').unwrap_or(4), '(', ')')?;
        let mut values = Vec::new();
        for value in split_top_level(args, ',') {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            values.push(unquote(value));
        }
        if values.is_empty() {
            return Err(parse_error("enum must contain at least one value"));
        }
        return Ok(FieldType::Enum(values));
    }

    match raw {
        "text" | "string" => Ok(FieldType::Text),
        "float" | "number" => Ok(FieldType::Float),
        "int" => Ok(FieldType::Int),
        "bool" | "boolean" => Ok(FieldType::Bool),
        "duration" => Ok(FieldType::Duration),
        "timestamp" => Ok(FieldType::Timestamp),
        other => Err(parse_error(format!("unsupported field type: {other}"))),
    }
}

fn parse_time_grain(raw: &str) -> TrackerResult<TimeGrain> {
    match raw.trim() {
        "day" => Ok(TimeGrain::Day),
        "week" => Ok(TimeGrain::Week),
        "month" => Ok(TimeGrain::Month),
        "quarter" => Ok(TimeGrain::Quarter),
        "year" => Ok(TimeGrain::Year),
        "all_time" => Ok(TimeGrain::AllTime),
        "custom" => Ok(TimeGrain::Custom),
        other => Err(parse_error(format!("unsupported time grain: {other}"))),
    }
}

fn parse_literal(raw: &str) -> TrackerResult<serde_json::Value> {
    let raw = raw.trim();
    if raw.eq("true") {
        return Ok(serde_json::Value::Bool(true));
    }
    if raw.eq("false") {
        return Ok(serde_json::Value::Bool(false));
    }
    if raw.eq("null") {
        return Ok(serde_json::Value::Null);
    }
    if let Ok(value) = raw.parse::<i64>() {
        return Ok(serde_json::json!(value));
    }
    if let Ok(value) = raw.parse::<f64>() {
        return Ok(serde_json::json!(value));
    }
    if raw.starts_with('{') && raw.ends_with('}') {
        return serde_json::from_str(raw).or(Ok(serde_json::Value::String(raw.to_string())));
    }
    Ok(serde_json::Value::String(unquote(raw)))
}

fn parse_expression(raw: &str) -> TrackerResult<Expression> {
    let mut parser = ExprParser::new(raw)?;
    let expr = parser.parse_expr(0)?;
    if !parser.is_eof() {
        return Err(parse_error(format!(
            "unexpected token at end of expression: {:?}",
            parser.peek()
        )));
    }
    Ok(expr)
}

#[derive(Clone, Debug, PartialEq)]
enum Token {
    Ident(String),
    Number(String),
    Str(String),
    True,
    False,
    Null,
    If,
    Then,
    Else,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    AndAnd,
    OrOr,
    EqEq,
    NotEq,
    Gt,
    Gte,
    Lt,
    Lte,
    Bang,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Comma,
    Colon,
}

struct ExprParser {
    tokens: Vec<Token>,
    cursor: usize,
}

impl ExprParser {
    fn new(raw: &str) -> TrackerResult<Self> {
        Ok(Self {
            tokens: tokenize(raw)?,
            cursor: 0,
        })
    }

    fn parse_expr(&mut self, min_prec: u8) -> TrackerResult<Expression> {
        let mut left = self.parse_prefix()?;

        loop {
            let Some((op, prec)) = self.peek_binary_op() else {
                break;
            };
            if prec < min_prec {
                break;
            }
            self.cursor += 1;
            let right = self.parse_expr(prec + 1)?;
            left = Expression::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    fn parse_prefix(&mut self) -> TrackerResult<Expression> {
        match self.next() {
            Some(Token::If) => self.parse_if_expr(),
            Some(Token::Minus) => {
                let expr = self.parse_expr(100)?;
                Ok(Expression::Binary {
                    op: BinaryOperator::Sub,
                    left: Box::new(Expression::Int(0)),
                    right: Box::new(expr),
                })
            }
            Some(Token::LParen) => {
                let expr = self.parse_expr(0)?;
                self.expect(Token::RParen)?;
                Ok(expr)
            }
            Some(Token::Number(value)) => {
                if value.contains('.') {
                    Ok(Expression::Number(value.parse::<f64>().map_err(|_| {
                        parse_error(format!("invalid number literal: {value}"))
                    })?))
                } else {
                    Ok(Expression::Int(value.parse::<i64>().map_err(|_| {
                        parse_error(format!("invalid integer literal: {value}"))
                    })?))
                }
            }
            Some(Token::True) => Ok(Expression::Bool(true)),
            Some(Token::False) => Ok(Expression::Bool(false)),
            Some(Token::Null) => Ok(Expression::Null),
            Some(Token::Str(value)) => Ok(Expression::Text(value)),
            Some(Token::Ident(name)) => {
                if self.peek() == Some(&Token::LParen) {
                    self.cursor += 1;
                    let args = self.parse_function_args()?;
                    Ok(Expression::Function { name, args })
                } else {
                    Ok(Expression::Field(name))
                }
            }
            Some(Token::LBrace) => self.parse_object_literal(),
            Some(Token::Bang) => {
                let expr = self.parse_expr(100)?;
                Ok(Expression::Function {
                    name: "not".to_string(),
                    args: vec![expr],
                })
            }
            other => Err(parse_error(format!("unexpected token: {:?}", other))),
        }
    }

    fn parse_object_literal(&mut self) -> TrackerResult<Expression> {
        let mut depth = 1usize;
        let mut raw = String::from("{");
        while let Some(token) = self.next() {
            match token {
                Token::LBrace => {
                    depth += 1;
                    raw.push('{');
                }
                Token::RBrace => {
                    depth -= 1;
                    raw.push('}');
                    if depth == 0 {
                        return Ok(Expression::Text(raw));
                    }
                }
                Token::Colon => raw.push(':'),
                Token::Comma => raw.push(','),
                Token::Ident(value) => raw.push_str(&value),
                Token::Number(value) => raw.push_str(&value),
                Token::Str(value) => {
                    raw.push('"');
                    raw.push_str(&value);
                    raw.push('"');
                }
                Token::True => raw.push_str("true"),
                Token::False => raw.push_str("false"),
                Token::Null => raw.push_str("null"),
                Token::Plus => raw.push('+'),
                Token::Minus => raw.push('-'),
                Token::Star => raw.push('*'),
                Token::Slash => raw.push('/'),
                Token::Percent => raw.push('%'),
                Token::AndAnd => raw.push_str("&&"),
                Token::OrOr => raw.push_str("||"),
                Token::EqEq => raw.push_str("=="),
                Token::NotEq => raw.push_str("!="),
                Token::Gt => raw.push('>'),
                Token::Gte => raw.push_str(">="),
                Token::Lt => raw.push('<'),
                Token::Lte => raw.push_str("<="),
                Token::Bang => raw.push('!'),
                Token::LParen => raw.push('('),
                Token::RParen => raw.push(')'),
                Token::If => raw.push_str("if"),
                Token::Then => raw.push_str("then"),
                Token::Else => raw.push_str("else"),
            }
        }
        Err(parse_error("unterminated object literal in expression"))
    }

    fn parse_if_expr(&mut self) -> TrackerResult<Expression> {
        let condition = self.parse_condition()?;
        self.expect(Token::Then)?;
        let then_expr = self.parse_expr(0)?;
        let else_expr = if self.peek() == Some(&Token::Else) {
            self.cursor += 1;
            self.parse_expr(0)?
        } else {
            Expression::Null
        };
        Ok(Expression::Conditional {
            condition: Box::new(condition),
            then_expr: Box::new(then_expr),
            else_expr: Box::new(else_expr),
        })
    }

    fn parse_condition(&mut self) -> TrackerResult<Condition> {
        self.parse_or_condition()
    }

    fn parse_or_condition(&mut self) -> TrackerResult<Condition> {
        let mut parts = vec![self.parse_and_condition()?];
        while self.peek() == Some(&Token::OrOr) {
            self.cursor += 1;
            parts.push(self.parse_and_condition()?);
        }
        if parts.len() == 1 {
            Ok(parts.remove(0))
        } else {
            Ok(Condition::Or(parts))
        }
    }

    fn parse_and_condition(&mut self) -> TrackerResult<Condition> {
        let mut parts = vec![self.parse_not_condition()?];
        while self.peek() == Some(&Token::AndAnd) {
            self.cursor += 1;
            parts.push(self.parse_not_condition()?);
        }
        if parts.len() == 1 {
            Ok(parts.remove(0))
        } else {
            Ok(Condition::And(parts))
        }
    }

    fn parse_not_condition(&mut self) -> TrackerResult<Condition> {
        if self.peek() == Some(&Token::Bang) {
            self.cursor += 1;
            return Ok(Condition::Not(Box::new(self.parse_not_condition()?)));
        }
        self.parse_condition_atom()
    }

    fn parse_condition_atom(&mut self) -> TrackerResult<Condition> {
        if self.peek() == Some(&Token::LParen) {
            self.cursor += 1;
            let condition = self.parse_condition()?;
            self.expect(Token::RParen)?;
            return Ok(condition);
        }

        let left = self.parse_expr(0)?;
        let op = match self.peek() {
            Some(Token::EqEq) => Some(ComparisonOperator::Eq),
            Some(Token::NotEq) => Some(ComparisonOperator::Neq),
            Some(Token::Gt) => Some(ComparisonOperator::Gt),
            Some(Token::Gte) => Some(ComparisonOperator::Gte),
            Some(Token::Lt) => Some(ComparisonOperator::Lt),
            Some(Token::Lte) => Some(ComparisonOperator::Lte),
            _ => None,
        };

        if let Some(op) = op {
            self.cursor += 1;
            let right = self.parse_expr(0)?;
            return Ok(Condition::Comparison {
                op,
                left: Box::new(left),
                right: Box::new(right),
            });
        }

        match left {
            Expression::Bool(true) => Ok(Condition::True),
            Expression::Bool(false) => Ok(Condition::False),
            other => Ok(Condition::Comparison {
                op: ComparisonOperator::Neq,
                left: Box::new(other),
                right: Box::new(Expression::Null),
            }),
        }
    }

    fn parse_function_args(&mut self) -> TrackerResult<Vec<Expression>> {
        let mut args = Vec::new();
        if self.peek() == Some(&Token::RParen) {
            self.cursor += 1;
            return Ok(args);
        }
        loop {
            let arg = self.parse_expr(0)?;
            args.push(arg);
            match self.next() {
                Some(Token::Comma) => continue,
                Some(Token::RParen) => break,
                other => {
                    return Err(parse_error(format!(
                        "expected ',' or ')' in function call, got {:?}",
                        other
                    )))
                }
            }
        }
        Ok(args)
    }

    fn peek_binary_op(&self) -> Option<(BinaryOperator, u8)> {
        match self.peek() {
            Some(Token::Plus) => Some((BinaryOperator::Add, 10)),
            Some(Token::Minus) => Some((BinaryOperator::Sub, 10)),
            Some(Token::Star) => Some((BinaryOperator::Mul, 20)),
            Some(Token::Slash) => Some((BinaryOperator::Div, 20)),
            Some(Token::Percent) => Some((BinaryOperator::Mod, 20)),
            _ => None,
        }
    }

    fn expect(&mut self, expected: Token) -> TrackerResult<()> {
        let got = self.next();
        if got.as_ref() == Some(&expected) {
            Ok(())
        } else {
            Err(parse_error(format!(
                "expected token {:?}, got {:?}",
                expected, got
            )))
        }
    }

    fn next(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.cursor).cloned();
        if token.is_some() {
            self.cursor += 1;
        }
        token
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.cursor)
    }

    fn is_eof(&self) -> bool {
        self.cursor >= self.tokens.len()
    }
}

fn tokenize(raw: &str) -> TrackerResult<Vec<Token>> {
    let chars: Vec<char> = raw.chars().collect();
    let mut index = 0usize;
    let mut tokens = Vec::new();

    while index < chars.len() {
        let ch = chars[index];
        if ch.is_whitespace() {
            index += 1;
            continue;
        }

        if ch == '"' {
            let mut i = index + 1;
            let mut value = String::new();
            while i < chars.len() {
                let c = chars[i];
                if c == '"' {
                    break;
                }
                value.push(c);
                i += 1;
            }
            if i >= chars.len() || chars[i] != '"' {
                return Err(parse_error("unterminated string literal"));
            }
            tokens.push(Token::Str(value));
            index = i + 1;
            continue;
        }

        if ch.is_ascii_digit() {
            let mut i = index;
            let mut seen_dot = false;
            while i < chars.len() {
                let c = chars[i];
                if c == '.' && !seen_dot {
                    seen_dot = true;
                    i += 1;
                    continue;
                }
                if !c.is_ascii_digit() {
                    break;
                }
                i += 1;
            }
            tokens.push(Token::Number(chars[index..i].iter().collect()));
            index = i;
            continue;
        }

        if ch.is_ascii_alphabetic() || ch == '_' {
            let mut i = index;
            while i < chars.len() {
                let c = chars[i];
                if !(c.is_ascii_alphanumeric() || c == '_' || c == '.') {
                    break;
                }
                i += 1;
            }
            let ident: String = chars[index..i].iter().collect();
            let token = match ident.as_str() {
                "if" => Token::If,
                "then" => Token::Then,
                "else" => Token::Else,
                "true" => Token::True,
                "false" => Token::False,
                "null" => Token::Null,
                _ => Token::Ident(ident),
            };
            tokens.push(token);
            index = i;
            continue;
        }

        let next = chars.get(index + 1).copied();
        match (ch, next) {
            ('&', Some('&')) => {
                tokens.push(Token::AndAnd);
                index += 2;
            }
            ('|', Some('|')) => {
                tokens.push(Token::OrOr);
                index += 2;
            }
            ('=', Some('=')) => {
                tokens.push(Token::EqEq);
                index += 2;
            }
            ('!', Some('=')) => {
                tokens.push(Token::NotEq);
                index += 2;
            }
            ('>', Some('=')) => {
                tokens.push(Token::Gte);
                index += 2;
            }
            ('<', Some('=')) => {
                tokens.push(Token::Lte);
                index += 2;
            }
            _ => {
                let token = match ch {
                    '+' => Token::Plus,
                    '-' => Token::Minus,
                    '*' => Token::Star,
                    '/' => Token::Slash,
                    '%' => Token::Percent,
                    '>' => Token::Gt,
                    '<' => Token::Lt,
                    '!' => Token::Bang,
                    '(' => Token::LParen,
                    ')' => Token::RParen,
                    '{' => Token::LBrace,
                    '}' => Token::RBrace,
                    ',' => Token::Comma,
                    ':' => Token::Colon,
                    _ => {
                        return Err(parse_error(format!(
                            "unexpected character in expression: {ch}"
                        )))
                    }
                };
                tokens.push(token);
                index += 1;
            }
        }
    }

    Ok(tokens)
}

fn parse_version(raw: &str) -> TrackerResult<TrackerVersion> {
    let token = raw.trim().trim_start_matches('v');
    let mut parts = token.split('.');
    let major = parts
        .next()
        .ok_or_else(|| parse_error("invalid version"))?
        .parse::<u32>()
        .map_err(|_| parse_error("invalid major version"))?;
    let minor = parts
        .next()
        .unwrap_or("0")
        .parse::<u32>()
        .map_err(|_| parse_error("invalid minor version"))?;
    let patch = parts
        .next()
        .unwrap_or("0")
        .parse::<u32>()
        .map_err(|_| parse_error("invalid patch version"))?;
    Ok(TrackerVersion::new(major, minor, patch))
}

fn strip_comments(input: &str) -> String {
    let mut out = String::new();
    let mut in_block = false;
    for line in input.lines() {
        let mut line = line.to_string();
        if in_block {
            if let Some(end) = line.find("*/") {
                in_block = false;
                line = line[(end + 2)..].to_string();
            } else {
                continue;
            }
        }
        if let Some(start) = line.find("/*") {
            if let Some(end) = line[start + 2..].find("*/") {
                let end_idx = start + 2 + end;
                line.replace_range(start..=end_idx + 1, "");
            } else {
                line.truncate(start);
                in_block = true;
            }
        }
        if let Some(idx) = line.find("//") {
            line.truncate(idx);
        }
        out.push_str(line.trim_end());
        out.push('\n');
    }
    out
}

fn section_body<'a>(body: &'a str, name: &str) -> TrackerResult<&'a str> {
    section_body_optional(body, name)
        .ok_or_else(|| parse_error(format!("missing required section '{name}'")))
}

fn section_body_optional<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    let idx = find_top_level_keyword(body, name)?;
    let after = &body[idx + name.len()..];
    let brace_rel = after.find('{')?;
    extract_braced(after, brace_rel).ok().map(|s| {
        // SAFETY: returned string slice lives as long as original body.
        let start = idx + name.len() + brace_rel + 1;
        let end = start + s.len();
        &body[start..end]
    })
}

fn extract_braced(input: &str, brace_idx: usize) -> TrackerResult<&str> {
    extract_braced_like(input, brace_idx, '{', '}')
}

fn extract_braced_like(
    input: &str,
    brace_idx: usize,
    open: char,
    close: char,
) -> TrackerResult<&str> {
    let bytes = input.as_bytes();
    if bytes.get(brace_idx).copied() != Some(open as u8) {
        return Err(parse_error(format!("expected '{open}'")));
    }
    let mut depth = 0i32;
    let mut idx = brace_idx;
    while idx < bytes.len() {
        let ch = bytes[idx] as char;
        if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                return Ok(&input[(brace_idx + 1)..idx]);
            }
        }
        idx += 1;
    }
    Err(parse_error(format!("unclosed '{open}{close}' block")))
}

fn find_keyword(input: &str, keyword: &str) -> Option<usize> {
    let mut offset = 0usize;
    while let Some(idx) = input[offset..].find(keyword) {
        let absolute = offset + idx;
        let prev_ok = absolute == 0
            || !input.as_bytes()[absolute - 1].is_ascii_alphanumeric()
                && input.as_bytes()[absolute - 1] != b'_';
        let end = absolute + keyword.len();
        let next_ok = end >= input.len()
            || !input.as_bytes()[end].is_ascii_alphanumeric() && input.as_bytes()[end] != b'_';
        if prev_ok && next_ok {
            return Some(absolute);
        }
        offset = end;
    }
    None
}

fn find_top_level_keyword(input: &str, keyword: &str) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut idx = 0usize;
    let mut depth = 0i32;
    let mut in_string = false;

    while idx < bytes.len() {
        let ch = bytes[idx] as char;
        if ch == '"' {
            in_string = !in_string;
            idx += 1;
            continue;
        }
        if in_string {
            idx += 1;
            continue;
        }

        match ch {
            '{' => {
                depth += 1;
                idx += 1;
                continue;
            }
            '}' => {
                depth -= 1;
                idx += 1;
                continue;
            }
            _ => {}
        }

        if depth == 0 && input[idx..].starts_with(keyword) {
            let prev_ok =
                idx == 0 || (!bytes[idx - 1].is_ascii_alphanumeric() && bytes[idx - 1] != b'_');
            let end = idx + keyword.len();
            let next_ok =
                end >= bytes.len() || (!bytes[end].is_ascii_alphanumeric() && bytes[end] != b'_');
            if prev_ok && next_ok {
                return Some(idx);
            }
        }

        idx += 1;
    }

    None
}

fn statement_lines(body: &str) -> Vec<String> {
    body.lines()
        .flat_map(|line| split_top_level(line, ','))
        .map(|line| line.trim().trim_end_matches(';').trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

fn split_top_level(input: &str, separator: char) -> Vec<&str> {
    let mut result = Vec::new();
    let mut depth_paren = 0i32;
    let mut depth_brace = 0i32;
    let mut in_string = false;
    let mut start = 0usize;
    let chars: Vec<char> = input.chars().collect();
    for (idx, ch) in chars.iter().enumerate() {
        match *ch {
            '"' => in_string = !in_string,
            '(' if !in_string => depth_paren += 1,
            ')' if !in_string => depth_paren -= 1,
            '{' if !in_string => depth_brace += 1,
            '}' if !in_string => depth_brace -= 1,
            c if c == separator && !in_string && depth_paren == 0 && depth_brace == 0 => {
                result.push(&input[start..idx]);
                start = idx + 1;
            }
            _ => {}
        }
    }
    result.push(&input[start..]);
    result
}

fn unquote(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        trimmed[1..trimmed.len() - 1].to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_error(message: impl Into<String>) -> TrackerError {
    TrackerError::new_simple(ErrorCode::DslParseError, message.into())
}

fn parse_error_at_line(message: impl Into<String>, line: usize, line_text: &str) -> TrackerError {
    TrackerError::new_simple(ErrorCode::DslParseError, message.into()).with_context(
        serde_json::json!({
            "line": line,
            "line_text": line_text
        }),
    )
}

struct HeaderLexer<'a> {
    input: &'a str,
    cursor: usize,
}

impl<'a> HeaderLexer<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, cursor: 0 }
    }

    fn next_token(&mut self) -> Option<String> {
        let bytes = self.input.as_bytes();
        while self.cursor < bytes.len() && bytes[self.cursor].is_ascii_whitespace() {
            self.cursor += 1;
        }
        if self.cursor >= bytes.len() {
            return None;
        }

        if bytes[self.cursor] == b'"' {
            let start = self.cursor;
            self.cursor += 1;
            while self.cursor < bytes.len() && bytes[self.cursor] != b'"' {
                self.cursor += 1;
            }
            if self.cursor < bytes.len() {
                self.cursor += 1;
            }
            return Some(self.input[start..self.cursor].to_string());
        }

        let start = self.cursor;
        while self.cursor < bytes.len()
            && !bytes[self.cursor].is_ascii_whitespace()
            && bytes[self.cursor] != b'{'
        {
            self.cursor += 1;
        }
        Some(self.input[start..self.cursor].to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sample_dsl_sections() {
        let dsl = r#"
        tracker "sample" v1 {
          fields {
            group_key: text
            value_a: float optional
          }
          metrics {
            total_value = sum(value_a) over all_time
          }
          views {
            view "summary" {
              config = {"metrics":{"total_value":{"metric":"total_value"}}}
            }
          }
        }
        "#;
        let ast = parse_tracker(dsl).expect("parse sample dsl");
        assert_eq!(ast.name, "sample");
        assert!(!ast.fields.is_empty());
        assert!(!ast.metrics.is_empty());
        assert!(!ast.views.is_empty());
    }

    #[test]
    fn parse_if_expression() {
        let expr =
            parse_expression("if (value_a > 0 && value_b > 0) then value_a * value_b else 0")
                .expect("parse expression");
        match expr {
            Expression::Conditional { .. } => {}
            other => panic!("expected conditional expression, got {other:?}"),
        }
    }

    #[test]
    fn parse_fields_error_has_line_context() {
        let dsl = r#"
        tracker "sample" v1 {
          fields {
            valid: text
            bad_line_without_colon
          }
        }
        "#;
        let err = parse_tracker(dsl).expect_err("invalid field line should fail");
        assert_eq!(err.code, ErrorCode::DslParseError);
        assert_eq!(err.context["line"], 2);
        assert_eq!(err.context["line_text"], "bad_line_without_colon");
    }

    #[test]
    fn parse_view_error_has_line_context() {
        let dsl = r#"
        tracker "sample" v1 {
          fields { value: float }
          views {
            view "summary" {
              bad_line_without_assignment
            }
          }
        }
        "#;
        let err = parse_tracker(dsl).expect_err("invalid view line should fail");
        assert_eq!(err.code, ErrorCode::DslParseError);
        assert_eq!(err.context["line"], 1);
    }
}
