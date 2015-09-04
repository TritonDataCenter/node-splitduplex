/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_util = require('util');
var mod_stream = require('stream');

var mod_jsprim = require('jsprim');

function
SplitDuplex(options)
{
	var self = this;

	mod_stream.Duplex.call(self, options);

	/*
	 * The input and output passthrough streams should do no additional
	 * buffering:
	 */
	var pt_opts = mod_jsprim.mergeObjects(options, {
		highWaterMark: 0
	}, null);
	self.spld_in = new mod_stream.PassThrough(pt_opts);
	self.spld_out = new mod_stream.PassThrough(pt_opts);

	self.spld_read_active = false;
	self.spld_need_data = false;
	self.spld_data_avail = false;
	self.spld_out.on('readable', function () {
		/*
		 * Data is available to be read on our Readable side, from
		 * the underlying output stream.
		 */
		self.spld_data_avail = true;
		self._service_read();
	});
	self.spld_out.once('end', function () {
		self.push(null);
	});

	self.once('finish', function () {
		/*
		 * The Writable side of the duplex stream has reached the
		 * end of its input stream; propagate this condition to
		 * the underlying input stream.
		 */
		self.spld_in.end();
	});
}
mod_util.inherits(SplitDuplex, mod_stream.Duplex);

SplitDuplex.prototype.streamInput = function
streamInput()
{
	return (this.spld_in);
};

SplitDuplex.prototype.streamOutput = function
streamOutput()
{
	return (this.spld_out);
};

SplitDuplex.prototype._read = function
_read()
{
	/*
	 * Our consumer has requested data from our Readable (output) side.
	 */
	this.spld_need_data = true;
	this._service_read();
};

SplitDuplex.prototype._service_read = function
_service_read()
{
	/*
	 * We require _both_ that the output stream has data to read, _and_
	 * that the Duplex itself is being read from; otherwise there is no
	 * need to move data.
	 */
	if (!this.spld_need_data || !this.spld_data_avail) {
		return;
	}

	/*
	 * Protect against recursive calls to _service_read():
	 */
	if (this.spld_read_active) {
		return;
	}
	this.spld_read_active = true;

	for (;;) {
		var input = this.spld_out.read();

		if (input === null) {
			/*
			 * There was no more data from the output passthrough,
			 * so go back to sleep for now.
			 */
			this.spld_data_avail = false;
			this.spld_read_active = false;
			return;
		}

		if (!this.push(input)) {
			/*
			 * No more data fits in our outbound buffer; sleep for
			 * now.
			 */
			this.spld_data_needed = false;
			this.spld_read_active = false;
			return;
		}
	}
};

SplitDuplex.prototype._write = function
_write(ch, enc, done)
{
	return (this.spld_in.write.apply(this.spld_in, arguments));
};

module.exports = SplitDuplex;
