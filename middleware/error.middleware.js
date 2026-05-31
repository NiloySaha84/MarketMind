const errorMiddleware = (err, req, res, next) => {
    try {
        let error = {...err};
        error.message = err.message;
        console.error(err);

        if (error.name === 'CastError') {
            const message = `Resource not found with id of ${error.value}`;
            error = new Error(message);
            error.statusCode = 404;
        }

        // Email check constraint violation
        if (error.code === '23514' && error.constraint === 'email_format_check') {
            error = new Error('Invalid email format');
            error.statusCode = 400;
        }

        // Other PostgreSQL check-constraint violations
        if (error.code === '23514' && error.constraint !== 'email_format_check') {
            error = new Error('Data failed database validation rule');
            error.statusCode = 400;
        }

        // Invalid JSON payload
        if (error.type === 'entity.parse.failed') {
            error = new Error('Invalid JSON payload');
            error.statusCode = 400;
        }

        // PostgreSQL unique violation
        if (error.code === '23505') {
            error = new Error('Duplicate value violates unique constraint');
            error.statusCode = 409;
        }

        // PostgreSQL foreign key violation
        if (error.code === '23503') {
            error = new Error('Referenced resource does not exist');
            error.statusCode = 400;
        }

        // PostgreSQL NOT NULL violation
        if (error.code === '23502') {
            error = new Error('Missing required field');
            error.statusCode = 400;
        }

        // PostgreSQL invalid text representation (e.g., bad UUID/int format)
        if (error.code === '22P02') {
            error = new Error('Invalid input type');
            error.statusCode = 400;
        }

        // PostgreSQL relation/table does not exist
        if (error.code === '42P01') {
            error = new Error('Requested database table does not exist');
            error.statusCode = 500;
        }

        // PostgreSQL auth/connection errors
        if (error.code === '28000') {
            error = new Error('Database authentication failed');
            error.statusCode = 500;
        }

        if (error.code === 'ECONNREFUSED') {
            error = new Error('Database connection refused');
            error.statusCode = 500;
        }

        if (res.headersSent) {
            return next(error);
        }

        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Server Error'
        });
    } catch (error) {
        next(error);
    }
}

export default errorMiddleware;