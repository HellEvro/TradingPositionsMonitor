class Logger {
    static LEVELS = {
        DEBUG: 'DEBUG',
        INFO: 'INFO',
        WARNING: 'WARN',
        ERROR: 'ERROR'
    };

    static log(module, message, data = null, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${module}] [${level}] ${message}`;
        
        switch (level) {
            case this.LEVELS.ERROR:
                console.error(logMessage, data);
                break;
            case this.LEVELS.WARNING:
                console.warn(logMessage, data);
                break;
            case this.LEVELS.DEBUG:
                console.debug(logMessage, data);
                break;
            default:
                console.log(logMessage, data);
        }
    }

    static debug(module, message, data = null) {
        this.log(module, message, data, this.LEVELS.DEBUG);
    }

    static info(module, message, data = null) {
        this.log(module, message, data, this.LEVELS.INFO);
    }

    static warn(module, message, data = null) {
        this.log(module, message, data, this.LEVELS.WARNING);
    }

    static error(module, message, data = null) {
        this.log(module, message, data, this.LEVELS.ERROR);
    }
}

window.Logger = Logger; 